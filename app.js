import { BubbleSystem } from './bubbleSystem.js';
import { ModelLoader } from './modelLoader.js';
import { ShipControls } from './inputControls.js';
import { SimpleClouds } from './simpleClouds.js';

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

// Loading screen elements
const loadingScreen = document.getElementById('loadingScreen');
const loadingText = document.getElementById('loadingText');

// Function to show loading screen
function showLoadingScreen(text = 'Setting sail...') {
    if (loadingScreen && loadingText) {
        loadingText.textContent = text;
        loadingScreen.classList.add('visible');
    }
}

// Function to hide loading screen
function hideLoadingScreen() {
    if (loadingScreen) {
        loadingScreen.classList.remove('visible');
    }
}

// Make loading screen functions available globally
window.showLoadingScreen = showLoadingScreen;
window.hideLoadingScreen = hideLoadingScreen;

// Disable controls by default
let controlsEnabled = false;

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
    
    // Set a wider field of view and position camera higher
    camera.fov = 1.5;
    camera.position.set(0, 50, -50); // Higher and back
    camera.setTarget(new BABYLON.Vector3(0, 0, 0)); // Look at center
    camera.upperBetaLimit = Math.PI / 2.2; // Prevent looking straight down
    camera.lowerRadiusLimit = 10; // Prevent zooming too close
    
    // Create directional light - positioned high and at an angle
    const sunLight = new BABYLON.DirectionalLight("sunLight", new BABYLON.Vector3(-1, -2, 0.5), scene);
    sunLight.intensity = 1.0;
    sunLight.position = new BABYLON.Vector3(250, 250, 250);
    
    // Disable shadows for better performance
    sunLight.shadowEnabled = false;
    
    console.log('Shadow generator created and attached to light');
    
    // Create rocks with physics in a smaller area (200x200 units)
    createRocks(scene, 2, 50);
    
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
    

    // Create a reflection probe for the water
    const reflectionProbe = new BABYLON.ReflectionProbe("waterReflection", 512, scene);
    reflectionProbe.refreshRate = 1; // Update every frame
    
    // Create water material with reflection
    const waterMaterial = new BABYLON.StandardMaterial("waterMaterial", scene);
    waterMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.4, 1);  // Deeper blue
    waterMaterial.specularColor = new BABYLON.Color3(0.8, 0.9, 1.0);  // Brighter highlights for better reflection
    waterMaterial.alpha = 0.7;  // Slightly more opaque
    waterMaterial.specularPower = 64;  // Sharper highlights
    waterMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.2, 0.3);  // Subtle blue tint
    waterMaterial.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
    waterMaterial.backFaceCulling = false;
    waterMaterial.zOffset = -0.1;
    
    // Enable reflections
    waterMaterial.reflectionTexture = reflectionProbe.cubeTexture;
    waterMaterial.reflectionFresnelParameters = new BABYLON.FresnelParameters();
    waterMaterial.reflectionFresnelParameters.bias = 0.1;
    waterMaterial.reflectionFresnelParameters.power = 8;
    
    // Enable specular highlights
    waterMaterial.useReflectionFresnelFromSpecular = true;
    waterMaterial.specularPower = 128;
    
    // Add fresnel effect for better water appearance
    waterMaterial.indexOfRefraction = 0.8;
    
    // Apply material to ground
    ground.material = waterMaterial;
    
    // Add the ground to the reflection probe's render list
    reflectionProbe.renderList = [ground];
    
    // Add all meshes to reflection probe
    scene.meshes.forEach(mesh => {
        if (mesh !== ground && mesh !== oceanFloor) {
            reflectionProbe.renderList.push(mesh);
        }
    });
    
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
    
    // Add simple clouds
    const clouds = new SimpleClouds(scene, {
        reflectionProbe: reflectionProbe,
        minX: -150,           // Start from left side of the scene
        maxX: 150,            // Move to right side
        minZ: -100,           // Depth range
        maxZ: 100,
        minY: 5.5,            // 5 units above the highest wave point
        maxY: 5.5,            // No variation in height
        minSize: 10,          // Cloud size range
        maxSize: 30,
        speed: 0.1,           // Movement speed
        spawnInterval: 3000,   // New cloud every 3 seconds
        lifeTime: 30000       // 30 seconds lifetime
    });
    
    // Make clouds cast shadows
    if (shadowGenerator) {
        window.shadowGenerator = shadowGenerator; // Make it globally accessible
    }
    
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
    version: "1.0",
    objects: [{
        name: "ship-small.glb",
        path: "Assets/3D/Pirate/ship-small.glb",
        folder: "Pirate",
        position: {
            x: 100,
            y: 1,
            z: 0
        },
        rotation: {
            x: 0,
            y: 0,
            z: 0
        },
        rotationQuaternion: {
            x: 0,
            y: 0,
            z: 0,
            w: 1
        },
        scaling: {
            x: 1,
            y: 1,
            z: 1
        }
    }]
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
let isShipReady = false;

// Global ship controls reference
let shipControls = null; // Will hold the ship controls instance

// Global function to enable ship controls
window.enableShipControls = () => {
    if (!isShipReady && scene) {
        console.log("Enabling ship controls");
        isShipReady = true;
        
        // Enable physics
        scene.getPhysicsEngine().setTimeStep(1/60);
        
        // Check if we have ship controls from the ship model
        if (window.shipControls) {
            shipControls = window.shipControls;
            shipControls.enabled = true;
            console.log("Ship controls enabled");
        } else {
            console.warn("Ship controls not yet initialized. Will be enabled when ship is loaded.");
            // Try to find ship controls on the main model
            scene.meshes.forEach(mesh => {
                if (mesh._shipControls) {
                    window.shipControls = mesh._shipControls;
                    shipControls = window.shipControls;
                    shipControls.enabled = true;
                    console.log("Found and enabled ship controls on model");
                }
            });
        }
    }
};

const initializeApp = async () => {
    scene = createScene();
    // Create the model loader
    modelLoader = new ModelLoader(scene, statusElement);
    
    // First load the map/level
    try {
        statusElement.textContent = 'Loading map...';
        // Load your map/level here if needed
        // await loadMapOrLevel();
        
        // Then load the ship
        statusElement.textContent = 'Loading pirate ship...';
        await loadShip();
        
    } catch (error) {
        console.error('Error initializing game:', error);
        statusElement.textContent = `Error: ${error.message}`;
    }
};

async function loadShip() {
    try {
        const modelPath = defaultShipConfig.objects[0].path;
        const modelExists = await checkFileExists(modelPath);
        
        if (!modelExists) {
            throw new Error(`Model file not found at: ${modelPath}`);
        }
        
        // Load the ship model
        const mainModel = await modelLoader.loadModelsFromJson(defaultShipConfig, shadowGenerator);
        
        if (!mainModel) {
            throw new Error('Main model not found after loading');
        }
        
        const camera = scene.activeCamera;
        if (!camera) {
            throw new Error('Camera not found in scene');
        }
        
        console.log('Main model loaded:', mainModel);
            
        // Enable shadows for the main model
        // Initially disable collisions for the first second
        mainModel.checkCollisions = false;
        
        // Make sure all child meshes have proper settings but no collisions initially
        if (mainModel.getChildMeshes) {
            mainModel.getChildMeshes().forEach(mesh => {
                mesh.checkCollisions = false;
                mesh.receiveShadows = true;
                mesh.castShadow = true;
            });
        }
        
        // Enable collisions after 1 second
        setTimeout(() => {
            mainModel.checkCollisions = true;
            if (mainModel.getChildMeshes) {
                mainModel.getChildMeshes().forEach(mesh => {
                    mesh.checkCollisions = true;
                });
            }
            console.log('Ship collisions enabled');
        }, 1000);
        
        // Compute world matrix to ensure bounding box is calculated
        mainModel.computeWorldMatrix(true);
        
        // Create a box mesh for the physics collider that matches the ship size
        const shipExtents = mainModel.getBoundingInfo().boundingBox.extendSize;
        const shipCollider = new BABYLON.MeshBuilder.CreateBox('shipCollider', {
            width: 5 * 1.2,  // 20% larger than the model
            height: 5 * 0.8,  // Slightly shorter than the model
            depth: 5 * 1.2,   // 20% longer than the model
        }, scene);
        shipCollider.isVisible = false;  // Hide ship collider
        shipCollider.checkCollisions = false;  // Initially disable collider
        
        // Enable collider after 1 second
        setTimeout(() => {
            shipCollider.checkCollisions = true;
            console.log('Ship collider enabled');
        }, 1000);
        
        // Position collider at the same position as the ship with y-offset
        const colliderPosition = mainModel.absolutePosition.clone();
        colliderPosition.y += 0.5;  // Add y-offset
        shipCollider.position.copyFrom(colliderPosition);
        shipCollider.rotationQuaternion = mainModel.rotationQuaternion ? 
            mainModel.rotationQuaternion.clone() : 
            BABYLON.Quaternion.RotationYawPitchRoll(mainModel.rotation.y, 0, 0);
        
        // Add physics to the collider
        shipCollider.physicsImpostor = new BABYLON.PhysicsImpostor(
            shipCollider,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { 
                mass: 1000,  // Increased mass for better bounce effect
                restitution: 0.8,  // Higher bounce
                friction: 0.5,  // Moderate friction
                nativeOptions: {
                    collisionFilterGroup: 1,
                    collisionFilterMask: 1,
                    linearDamping: 0.05,  // Slightly higher damping for stability
                    angularDamping: 0.1,  // Higher angular damping
                    fixedRotation: false,
                    // Allow some rotation on all axes for more dynamic bounces
                    fixedRotationX: false,
                    fixedRotationZ: false,
                    // Better collision response
                    collisionResponse: true,
                    // Material properties for better bounce
                    material: {
                        friction: 0.5,
                        restitution: 0.8,
                        contactEquationStiffness: 1e8,
                        contactEquationRelaxation: 3
                    }
                }
            },
            scene
        );
        
        // Add collision callback for bounce effect
        shipCollider.physicsImpostor.registerOnPhysicsCollide(
            scene.meshes.filter(m => m !== shipCollider && m.physicsImpostor),
            function(main, collided) {
                // Calculate bounce force based on current velocity
                const velocity = main.getLinearVelocity();
                const speed = velocity.length();
                
                if (speed > 0.1) {  // Only apply bounce if moving fast enough
                    // Calculate bounce direction (opposite of current velocity)
                    const direction = velocity.normalize().scale(-1);
                    
                    // Apply bounce force (stronger with higher speed)
                    const bounceForce = direction.scale(speed * 50);
                    main.applyImpulse(bounceForce, shipCollider.getAbsolutePosition());
                    
                    // Add some angular velocity for visual effect
                    const torque = new BABYLON.Vector3(
                        (Math.random() - 0.5) * 10,
                        (Math.random() - 0.5) * 10,
                        (Math.random() - 0.5) * 10
                    );
                    main.applyImpulse(torque, shipCollider.getAbsolutePosition());
                }
            }
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
                //shipCollider.position.copyFrom(mainModel.position);
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
        
        // Create ship controls (initially disabled)
        window.shipControls = new ShipControls(scene, mainModel, {
            speed: 1,              // Start with 0 speed (disabled)
            rotationSpeed: 1,       // Start with 0 rotation speed (disabled)
            maxSpeed: 30.0,        // Increased from 3.0 to 30.0 for faster movement
            acceleration: 0.7,     // Faster acceleration
            deceleration: 0.95,    // Slower deceleration for more drift
            rotationAcceleration: 0.1,  // Faster rotation acceleration
            rotationDeceleration: 0.9,  // Slower rotation deceleration
            baseRotationSpeed: 0.8,     // Faster base rotation
            enabled: false         // Controls start disabled
        });
        
        // Store reference in the global scope
        shipControls = window.shipControls;
        
        // Add ship controls update to the render loop
        scene.registerBeforeRender(() => {
            // Only update controls if ship is ready
            if (isShipReady) {
                shipControls.update();
            }
            
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
        
        // Run the render loop
        engine.runRenderLoop(() => {
            scene.render();
        });
        
        // Handle browser resize
        window.addEventListener('resize', () => {
            engine.resize();
        });
        
        return mainModel;
    } catch (error) {
        console.error('Error loading default model:', error);
        statusElement.textContent = `Error: ${error.message || 'Failed to load pirate ship'}`;
        
        // Add a simple box as fallback
        const box = BABYLON.MeshBuilder.CreateBox('fallbackShip', { size: 2 }, scene);
        box.isVisible = false;  // Hide fallback ship
        box.position.y = 1;
        
        // Setup camera to follow the box
        if (scene.activeCamera) {
            scene.activeCamera.parent = box;
            scene.activeCamera.position = new BABYLON.Vector3(0, 10, -15);
            scene.activeCamera.setTarget(BABYLON.Vector3.Zero());
        }
        
        // Still need to run the render loop even in error case
        engine.runRenderLoop(() => {
            scene.render();
        });
        
        window.addEventListener('resize', () => {
            engine.resize();
        });
        
        return box; // Return the fallback box
    }
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
        
        // Position and rotate randomly with y-offset
        rock.position = new BABYLON.Vector3(x, startHeight + 0.5, z);  // Add y-offset
        rock.rotation = new BABYLON.Vector3(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Apply material and hide rock colliders
        rock.material = rockMaterial.clone(`rockMaterial_${i}`);
        rock.isVisible = false; // Hide rock colliders
        
        
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

// Function to load the test scene
async function loadTestScene(scene, modelLoader) {
    try {
        const response = await fetch('Assets/Worlds/scenetest.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const sceneData = await response.json();
        
        console.log('Loading test scene with data:', sceneData);
        
        // First, load all models
        if (sceneData.objects && Array.isArray(sceneData.objects)) {
            // Create a clean config with proper physics settings
            const physicsConfig = {
                version: sceneData.version || "1.0",
                objects: []
            };
            
            // Prepare all models with physics settings and apply 5x scaling
            for (const modelConfig of sceneData.objects) {
                // Scale the position by 5x
                const scaledPosition = modelConfig.position ? {
                    x: (modelConfig.position.x || 0) * 5,
                    y: (modelConfig.position.y || 0) * 5,
                    z: (modelConfig.position.z || 0) * 5
                } : { x: 0, y: 0, z: 0 };
                
                // Scale the size by 5x
                const scaledScaling = modelConfig.scaling ? {
                    x: (modelConfig.scaling.x || 1) * 5,
                    y: (modelConfig.scaling.y || 1) * 5,
                    z: (modelConfig.scaling.z || 1) * 5
                } : { x: 5, y: 5, z: 5 };
                
                const modelData = {
                    name: modelConfig.name || '',
                    path: modelConfig.path || '',
                    folder: modelConfig.folder || '',
                    position: scaledPosition,
                    rotation: modelConfig.rotation || { x: 0, y: 0, z: 0 },
                    rotationQuaternion: modelConfig.rotationQuaternion || { x: 0, y: 0, z: 0, w: 1 },
                    scaling: scaledScaling,
                    physics: modelConfig.physics || {
                        mass: 0,  // Default to static objects
                        friction: 1.0,
                        restitution: 0.2
                    }
                };
                physicsConfig.objects.push(modelData);
            }
            
            // Load all models with physics
            await modelLoader.loadModelsFromJson(physicsConfig);
            
            // Force update all physics impostors after a short delay
            setTimeout(() => {
                scene.meshes.forEach(mesh => {
                    if (mesh.physicsImpostor) {
                        mesh.physicsImpostor.forceUpdate();
                    }
                });
            }, 1000);
        }
        
        console.log('Test scene loaded successfully');
    } catch (error) {
        console.error('Error loading test scene:', error);
    }
}

// Start the application
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize the app
        await initializeApp();
        
        // Show loading screen before loading models
        showLoadingScreen('Loading world...');
        
        // Load test scene
        await loadTestScene(scene, modelLoader);
        
        // Hide loading screen when done
        hideLoadingScreen();
    } catch (error) {
        console.error('Error initializing application:', error);
        showLoadingScreen('Error loading game. Please refresh.');
    }
});
