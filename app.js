import { BubbleSystem } from './bubbleSystem.js';
import { ModelLoader } from './modelLoader.js';
import { ShipControls } from './inputControls.js';

// Global variables
let shadowGenerator; // Make shadowGenerator globally accessible

// Get DOM elements
const canvas = document.getElementById("renderCanvas");
const fileInput = document.getElementById("fileInput");
const statusElement = document.getElementById("status");

// Initialize the Babylon.js engine
const engine = new BABYLON.Engine(canvas, true);
let scene;
let modelLoader;

// Create a scene with camera and lights
const createScene = function() {
    const scene = new BABYLON.Scene(engine);
    
    // Enable physics engine first thing
    const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    const physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);
    
    // Create a simple free camera
    const camera = new BABYLON.FreeCamera("shipCamera", new BABYLON.Vector3(0, 5, -10), scene);
    camera.minZ = 0.1;
    camera.speed = 0; // Disable camera movement
    camera.angularSensibility = 0; // Disable camera rotation
    camera.applyGravity = false;
    camera.checkCollisions = false;
    
    // Disable all inputs
    camera.inputs.clear();
    camera.attachControl(canvas, false);
    
    // Set a wider field of view
    camera.fov = 1.5;
    
    // Create directional light for shadows - positioned high and at an angle
    const sunLight = new BABYLON.DirectionalLight("sunLight", new BABYLON.Vector3(-1, -2, 0.5), scene);
    sunLight.intensity = 1.0;
    sunLight.position = new BABYLON.Vector3(250, 250, 250);
    
    // Enable shadows on the light
    sunLight.shadowEnabled = true;
    sunLight.shadowMinZ = 1;
    sunLight.shadowMaxZ = 1000;
    
    // Configure shadow generator with higher resolution and better settings
    shadowGenerator = new BABYLON.ShadowGenerator(2048, sunLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 64;
    shadowGenerator.darkness = 0.5;
    shadowGenerator.normalBias = 0.05;
    shadowGenerator.bias = 0.0001;
    
    // Store the shadow generator on the light for easy access
    sunLight.shadowGenerator = shadowGenerator;
    
    console.log('Shadow generator created and attached to light');
    
    // Create rocks with physics in a smaller area (200x200 units)
    createRocks(scene, 50, 50);
    
    // Create the ocean floor (brown ground)
    const oceanFloor = BABYLON.MeshBuilder.CreateGround("oceanFloor", {
        width: 1000,
        height: 1000,
        subdivisions: 2 // Less subdivisions for better performance
    }, scene);
    oceanFloor.receiveShadows = true;
    oceanFloor.castShadow = false; // Don't cast shadows from the ocean floor
    oceanFloor.position.y = -2; // Position below the water surface
    
    // Add physics impostor to the ocean floor
    oceanFloor.physicsImpostor = new BABYLON.PhysicsImpostor(
        oceanFloor,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { 
            mass: 0, // Mass of 0 makes it static
            friction: 0.5,
            restitution: 0.3,
            nativeOptions: {
                material: {
                    friction: 0.5,
                    restitution: 0.3
                }
            }
        },
        scene
    );
    
    // Make sure collisions are enabled
    oceanFloor.checkCollisions = true;
    
    // Create material for ocean floor - pure white
    const floorMaterial = new BABYLON.StandardMaterial("floorMaterial", scene);
    floorMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // Pure white color
    floorMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Minimal specular
    floorMaterial.alpha = 1.0; // Fully opaque
    floorMaterial.backFaceCulling = false; // Show both sides
    floorMaterial.specularPower = 10; // Soft highlights
    floorMaterial.ambientColor = new BABYLON.Color3(1, 1, 1); // White ambient light
    oceanFloor.material = floorMaterial;
    
    // Enable physics for ocean floor
    oceanFloor.physicsImpostor = new BABYLON.PhysicsImpostor(
        oceanFloor,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { 
            mass: 0, 
            restitution: 0.3, 
            friction: 0.8,
            nativeOptions: {
                material: {
                    friction: 0.8,
                    restitution: 0.3,
                    contactEquationStiffness: 1e8,
                    contactEquationRelaxation: 3
                }
            }
        },
        scene
    );
    
    // Create water surface (semi-transparent)
    const ground = BABYLON.MeshBuilder.CreateGround("waterSurface", {
        width: 1000,
        height: 1000,
        subdivisions: 50 // More subdivisions for smoother waves over larger area
    }, scene);
    ground.receiveShadows = true;
    ground.castShadow = false; // Don't cast shadows from the water
    ground.position.y = 0; // Raise water surface to y=0
    

    // Create simple water material
    const waterMaterial = new BABYLON.StandardMaterial("waterMaterial", scene);
    waterMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.5, 0.8); // Lighter blue color
    waterMaterial.alpha = 0.4; // More transparent
    waterMaterial.specularPower = 64; // More pronounced highlights
    waterMaterial.specularColor = new BABYLON.Color3(1, 1, 1); // White highlights
    waterMaterial.alphaMode = BABYLON.Engine.ALPHA_COMBINE; // For transparency
    
    // Disable backface culling and enable transparency
    waterMaterial.backFaceCulling = false;
    waterMaterial.zOffset = -0.1; // Helps prevent z-fighting
    
    // Apply material to ground
    ground.material = waterMaterial;
    
    // Add simple wave animation
    let time = 0;
    scene.registerBeforeRender(() => {
        time += 0.01;
        const vertices = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (vertices) {
            for (let i = 0; i < vertices.length; i += 3) {
                // Skip Y coordinate (i+1) - we'll modify it for the wave effect
                const x = vertices[i];
                const z = vertices[i + 2];
                // Adjusted wave formula for larger ground
                const waveScale = 0.1; // Scale down wave frequency for larger area
                vertices[i + 1] = (Math.sin((x * waveScale) + (time * 2)) * 0.25) + 
                                 (Math.cos((z * waveScale) + (time * 1.5)) * 0.25);
            }
            ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, vertices);
        }
    });
    
    // Fog disabled for better visibility
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
    
    return scene;
};

// Handle file selection
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const jsonData = await readJsonFile(file);
        if (modelLoader) {
            await modelLoader.loadModelsFromJson(jsonData, shadowGenerator);
        }
        else {
            console.error('ModelLoader not initialized');
        }
    } catch (error) {
        console.error('Error loading file:', error);
        statusElement.textContent = 'Error loading file: ' + error.message;
    }
});

// Helper function to read JSON file
function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                resolve(JSON.parse(e.target.result));
            } catch (error) {
                reject(new Error('Invalid JSON format'));
            }
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsText(file);
    });
}

// Create a default ship configuration
const defaultShipConfig = {
    models: [{
        path: "Pirate/ship-small.glb",  // Make sure to include the .glb extension
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scaling: [1, 1, 1]
    }],
    metadata: {
        modelCount: 1,
        format: "1.0"
    }
};

// Camera setup is now handled directly in the initializeApp function

// Helper function to check if a file exists
async function checkFileExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.error('Error checking file:', url, error);
        return false;
    }
}

// Initialize the scene and model loader
const initializeApp = async () => {
    scene = createScene();
    // Make sure shadowGenerator is available before creating ModelLoader
    const sunLight = scene.getLightByName("sunLight");
    const shadowGen = sunLight ? sunLight.shadowGenerator : null;
    modelLoader = new ModelLoader(scene, statusElement, shadowGen);
    

    // Load the default ship model
    try {
        const modelPath = 'Assets/3D/' + defaultShipConfig.models[0].path;
        const modelExists = await checkFileExists(modelPath);
        
        if (!modelExists) {
            throw new Error(`Model file not found at: ${modelPath}`);
        }
        
        statusElement.textContent = 'Loading pirate ship...';
        await modelLoader.loadModelsFromJson(defaultShipConfig, shadowGenerator);
        
        // Get the camera and attach it to the main model
        const camera = scene.activeCamera;
        const mainModel = modelLoader.getMainModel();
        
        if (!mainModel) {
            throw new Error('Main model not found after loading');
        }
        
        if (!camera) {
            throw new Error('Camera not found in scene');
        }
        
        console.log('Main model loaded:', mainModel);
        

        // Enable shadows for the main model
        if (mainModel.getChildMeshes) {
            mainModel.getChildMeshes().forEach(mesh => {
                mesh.receiveShadows = true;
                mesh.castShadow = true;
                // Add each mesh to the shadow generator if it exists
                if (shadowGenerator) {
                    shadowGenerator.addShadowCaster(mesh);
                }
            });
        } else {
            // If getChildMeshes is not available, apply to the main model directly
            mainModel.receiveShadows = true;
            mainModel.castShadow = true;
            if (shadowGenerator) {
                shadowGenerator.addShadowCaster(mainModel);
            }
        }
        
        // Remove the separate collider and use the main model for physics
        mainModel.checkCollisions = true;
        
        // Make sure all child meshes have proper collision settings
        if (mainModel.getChildMeshes) {
            mainModel.getChildMeshes().forEach(mesh => {
                mesh.checkCollisions = true;
                mesh.receiveShadows = true;
                mesh.castShadow = true;
            });
        }
        
        // Compute world matrix to ensure bounding box is calculated
        mainModel.computeWorldMatrix(true);
        
        // Create a box mesh for the physics collider that matches the ship size
        const shipExtents = mainModel.getBoundingInfo().boundingBox.extendSize;
        const shipCollider = new BABYLON.MeshBuilder.CreateBox('shipCollider', {
            width: 5 * 1.2,  // 20% larger than the model
            height: 5 * 0.8,  // Slightly shorter than the model
            depth: 5 * 1.2,   // 20% longer than the model
        }, scene);
        shipCollider.isVisible = false;  // Make it visible for debugging
        shipCollider.checkCollisions = true;
        
        // Position collider at the same position as the ship
        shipCollider.position.copyFrom(mainModel.absolutePosition);
        shipCollider.rotationQuaternion = mainModel.rotationQuaternion ? 
            mainModel.rotationQuaternion.clone() : 
            BABYLON.Quaternion.RotationYawPitchRoll(mainModel.rotation.y, 0, 0);
        
        // Add physics to the collider
        shipCollider.physicsImpostor = new BABYLON.PhysicsImpostor(
            shipCollider,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { 
                mass: 500,  // Heavier mass for more momentum
                restitution: 0.1,  // Low bounce
                friction: 0.05,  // Very low friction for water
                nativeOptions: {
                    collisionFilterGroup: 1,
                    collisionFilterMask: 1,
                    linearDamping: 0.01,  // Very low linear damping for water
                    angularDamping: 0.05,  // Slightly higher angular damping
                    fixedRotation: false,
                    // Lock X and Z rotation
                    fixedRotationX: true,
                    fixedRotationZ: true
                }
            },
            scene
        );
        
        // Ensure we can read the rotation
        shipCollider.rotationQuaternion = shipCollider.rotationQuaternion || new BABYLON.Quaternion();
        
        // Make sure the ship model has a rotation quaternion
        mainModel.rotationQuaternion = mainModel.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(
            mainModel.rotation.x,
            mainModel.rotation.y,
            mainModel.rotation.z
        );
        
        // Store references
        mainModel._collider = shipCollider;
        shipCollider._mainModel = mainModel;
        
        // Make sure the ship has a rotation quaternion
        mainModel.rotationQuaternion = mainModel.rotationQuaternion || new BABYLON.Quaternion();
        
        // Initialize the collider's rotation to match the model
        if (shipCollider) {
            shipCollider.rotationQuaternion = shipCollider.rotationQuaternion || new BABYLON.Quaternion();
            shipCollider.rotationQuaternion.copyFrom(mainModel.rotationQuaternion);
        }
        
        // Simple sync in the render loop - let the collider drive the model
        scene.registerBeforeRender(() => {
            if (shipCollider && mainModel) {
                // Update model position to match collider
                mainModel.position.copyFrom(shipCollider.position);
                
                // Update model rotation to match collider (yaw only)
                mainModel.rotation.y = shipCollider.rotation.y;
                
                // Keep ship at water level
                if (shipCollider.position.y < 0) {
                    shipCollider.position.y = 0;
                    mainModel.position.y = 0;
                }
            }
        });
        
        // Initialize ship controls with the main model
        const shipControls = new ShipControls(scene, mainModel, {
            speed: 0.2,          // Base movement speed
            rotationSpeed: 0.06,  // Rotation speed
            maxSpeed: 1.0        // Maximum speed
        });
        
        // Add ship controls update to the render loop
        scene.registerBeforeRender(() => {
            shipControls.update();
            
            // Sync ship model with collider
            if (shipCollider && mainModel) {
                // Update model position to match collider
                mainModel.position.copyFrom(shipCollider.position);
                
                // Update model rotation to match collider (yaw only)
                mainModel.rotation.y = shipCollider.rotation.y;
                
                // Update quaternion if it exists
                if (mainModel.rotationQuaternion) {
                    mainModel.rotationQuaternion.copyFrom(
                        BABYLON.Quaternion.RotationYawPitchRoll(
                            shipCollider.rotation.y,
                            mainModel.rotation.x,
                            mainModel.rotation.z
                        )
                    );
                }
            }
        });
        
        // Store ship controls on the model for later access
        mainModel._shipControls = shipControls;
        
        // Add getSpeed method to mainModel for water trail
        Object.defineProperty(mainModel, 'getSpeed', {
            value: () => mainModel._shipControls ? 
                mainModel._shipControls.velocity.length() : 0,
            enumerable: false,
            configurable: true
        });
        
        // Set up camera to follow the ship
        try {
            // Camera setup - higher position with steeper angle
            const cameraHeight = 50;
            const cameraDistance = 20;
            const lookAhead = 5;
            
            // Store the camera's current position relative to the ship
            const cameraOffset = new BABYLON.Vector3(0, cameraHeight, -cameraDistance);
            
            // Function to update camera position to follow the ship
            const updateCameraPosition = () => {
                if (!mainModel) return;
                
                // Get the ship's rotation around Y axis
                const shipRotation = mainModel.rotation.y;
                
                // Calculate the rotated offset based on ship's rotation
                const rotatedOffset = new BABYLON.Vector3(
                    cameraOffset.x * Math.cos(shipRotation) - cameraOffset.z ,
                    cameraOffset.y,
                    cameraOffset.x * Math.sin(shipRotation) + cameraOffset.z 
                );
                
                // Update camera position (maintaining world Y position)
                camera.position.x = mainModel.position.x + rotatedOffset.x;
                camera.position.y = cameraOffset.y; // Maintain fixed height
                camera.position.z = mainModel.position.z + rotatedOffset.z;
                
                // Calculate look-at point (slightly in front of the ship)
                const lookAtPoint = new BABYLON.Vector3(
                    mainModel.position.x + Math.sin(shipRotation) * lookAhead,
                    mainModel.position.y,
                    mainModel.position.z + Math.cos(shipRotation) * lookAhead
                );
                
                // Update camera target
                camera.setTarget(lookAtPoint);
            };
            
            // Set initial camera position
            updateCameraPosition();
            
            // Update camera position in the render loop
            scene.registerBeforeRender(updateCameraPosition);
            
            // Debug: Add axis helper
            const axisSize = 5;
            const makeTextPlane = function(text, color, size) {
                const dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", 50, scene, true);
                dynamicTexture.hasAlpha = true;
                dynamicTexture.drawText(text, 5, 40, "bold 36px Arial", color, "transparent", true);
                const plane = BABYLON.MeshBuilder.CreatePlane("TextPlane", {size: size || 10}, scene);
                plane.material = new BABYLON.StandardMaterial("TextPlaneMaterial", scene);
                plane.material.backFaceCulling = false;
                plane.material.specularColor = new BABYLON.Color3(0, 0, 0);
                plane.material.diffuseTexture = dynamicTexture;
                return plane;
            };
            
            const axisX = BABYLON.MeshBuilder.CreateLines("axisX", { 
                points: [ 
                    BABYLON.Vector3.Zero(), 
                    new BABYLON.Vector3(axisSize, 0, 0), 
                    new BABYLON.Vector3(axisSize * 0.95, 0.05 * axisSize, 0), 
                    new BABYLON.Vector3(axisSize, 0, 0), 
                    new BABYLON.Vector3(axisSize * 0.95, -0.05 * axisSize, 0)
                ] 
            }, scene);
            axisX.color = new BABYLON.Color3(1, 0, 0);
            
            const xChar = makeTextPlane("X", "red", axisSize / 10);
            xChar.position = new BABYLON.Vector3(0.9 * axisSize, 0.05 * axisSize, 0);
            
            const axisY = BABYLON.MeshBuilder.CreateLines("axisY", { 
                points: [ 
                    BABYLON.Vector3.Zero(), 
                    new BABYLON.Vector3(0, axisSize, 0), 
                    new BABYLON.Vector3(-0.05 * axisSize, axisSize * 0.95, 0), 
                    new BABYLON.Vector3(0, axisSize, 0), 
                    new BABYLON.Vector3(0.05 * axisSize, axisSize * 0.95, 0)
                ] 
            }, scene);
            axisY.color = new BABYLON.Color3(0, 1, 0);
            
            const yChar = makeTextPlane("Y", "green", axisSize / 10);
            yChar.position = new BABYLON.Vector3(0, 0.9 * axisSize, 0);
            
            const axisZ = BABYLON.MeshBuilder.CreateLines("axisZ", { 
                points: [ 
                    BABYLON.Vector3.Zero(), 
                    new BABYLON.Vector3(0, 0, axisSize), 
                    new BABYLON.Vector3(0, -0.05 * axisSize, axisSize * 0.95),
                    new BABYLON.Vector3(0, 0, axisSize),
                    new BABYLON.Vector3(0, 0.05 * axisSize, axisSize * 0.95)
                ] 
            }, scene);
            axisZ.color = new BABYLON.Color3(0, 0, 1);
            
            const zChar = makeTextPlane("Z", "blue", axisSize / 10);
            zChar.position = new BABYLON.Vector3(0, 0.05 * axisSize, 0.9 * axisSize);
            
            // Add a simple light
            const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
            light.intensity = 0.7;
            
            // Set as active camera
            scene.activeCamera = camera;
            
            console.log('Camera locked to ship');
        } catch (error) {
            console.error('Error setting up camera:', error);
        }
        
        // Create bubble effect with dual trails positioned behind the ship
        const bubbleSystem = new BubbleSystem(scene, mainModel, {
            emitRate: 60,           // Bubbles per second (per side)
            maxBubbles: 80,        // Maximum number of bubbles (per side)
            minSize: 0.15,         // Larger minimum bubble size
            maxSize: 0.6,          // Larger maximum bubble size
            sizeVariation: 0.3,     // How much size can vary from base size
            minLifetime: 0.8,      // Slightly longer minimum lifetime
            maxLifetime: 2.0,      // Slightly longer maximum lifetime
            minSpeed: 0.3,         // Slightly faster minimum speed
            maxSpeed: 1.2,         // Slightly faster maximum speed
            sideOffset: -1.5,       // Distance from center to each side
            verticalOffset: -0.8,  // Slightly below the ship
            offsetZ: 1.5,         // Positioned further behind the ship
            color1: new BABYLON.Color4(0.8, 0.9, 1.0, 0.7),  // Light blue with more transparency
            color2: new BABYLON.Color4(0.95, 0.98, 1.0, 0.3)  // More transparent white
        });
        
        // Update bubbles in render loop
        scene.registerBeforeRender(() => {
            if (bubbleSystem) {
                bubbleSystem.update(scene.getEngine().getDeltaTime() / 1000);
            }
            
            // No need to set forward vector as it's already handled by Babylon.js
            // The forward direction can be accessed via mainModel.forward
        });
        
        statusElement.textContent = 'Pirate ship loaded! Use WASD to move, SHIFT for boost';
        
        // Add getSpeed method to mainModel for bubble system
        Object.defineProperty(mainModel, 'getSpeed', {
            value: () => mainModel._shipControls ? 
                mainModel._shipControls.velocity.length() : 0,
            writable: true,
            configurable: true
        });
    } catch (error) {
        console.error('Error loading default model:', error);
        statusElement.textContent = `Error: ${error.message || 'Failed to load pirate ship'}`;
        
        // Add a simple box as fallback
        const box = BABYLON.MeshBuilder.CreateBox('fallbackShip', { size: 2 }, scene);
        box.isVisible = true;
        box.position.y = 1;
        
        // Setup camera to follow the box
        if (scene.activeCamera) {
            scene.activeCamera.parent = box;
            scene.activeCamera.position = new BABYLON.Vector3(0, 10, -15);
            scene.activeCamera.setTarget(BABYLON.Vector3.Zero());
        }
    }
    
    // Run the render loop
    engine.runRenderLoop(() => {
        scene.render();
    });
    
    // Handle browser resize
    window.addEventListener('resize', () => {
        engine.resize();
    });
};

function createRocks(scene, count = 50, areaSize = 500) {
    const rocks = [];
    
    // Create a material for the rocks
    const rockMaterial = new BABYLON.StandardMaterial("rockMaterial", scene);
    rockMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    rockMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    rockMaterial.alpha = 0.9;
    
    for (let i = 0; i < count; i++) {
        // Random position within the area
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;
        const startHeight = 5 + Math.random() * 20; // Start between 5 and 25 units high
        
        // Random size variation
        const size = 1 + Math.random() * 4; // Between 1 and 5 units in size
        
        // Create a box for the rock (you can replace with a more complex mesh if desired)
        const rock = BABYLON.MeshBuilder.CreateBox(`rock_${i}`, {
            width: size,
            height: size * (0.5 + Math.random() * 0.5), // Make height between 0.5x and 1x of width
            depth: size * (0.5 + Math.random() * 0.5)  // Make depth between 0.5x and 1x of width
        }, scene);
        
        // Position and rotate randomly
        rock.position = new BABYLON.Vector3(x, startHeight, z);
        rock.rotation = new BABYLON.Vector3(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Apply material
        rock.material = rockMaterial.clone(`rockMaterial_${i}`);

        rock.receiveShadows = true;
        rock.castShadows = true;
        rock.isVisible = true; // Make it invisible in the final game

        shadowGenerator.addShadowCaster(rock);
        
        
        // Add physics with mass (gravity will affect it)
        rock.physicsImpostor = new BABYLON.PhysicsImpostor(
            rock,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { 
                mass: size * 2,
                friction: 0.5,
                restitution: 0.2,
                nativeOptions: {
                    collisionFilterGroup: 1,  // Same group as ship
                    collisionFilterMask: 1,   // Collide with same group
                    material: {
                        friction: 0.5,
                        restitution: 0.2,
                        contactEquationStiffness: 1e8,
                        contactEquationRelaxation: 3
                    }
                }
            },
            scene
        );
        
        // Make sure rocks collide with everything
        rock.checkCollisions = true;
        
        // Add a small delay before enabling collisions to prevent initial jitter
        setTimeout(() => {
            if (rock.physicsImpostor) {
                rock.physicsImpostor.forceUpdate();
            }
        }, 100);
        
        // Add to array
        rocks.push(rock);
    }
    
    console.log(`Created ${rocks.length} rocks`);
    return rocks;
}

// Start the application
window.addEventListener('DOMContentLoaded', initializeApp);
