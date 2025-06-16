import { BubbleSystem } from './bubbleSystem.js';
import { ModelLoader } from './modelLoader.js';
import { ShipControls } from './inputControls.js';

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
    camera.fov = 1.2;
    
    // Add lights
    const light1 = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
    light1.intensity = 0.7;
    
    const light2 = new BABYLON.DirectionalLight("light2", new BABYLON.Vector3(0, -1, 1), scene);
    light2.intensity = 0.5;
    
    // Enable scene shadows
    const shadowGenerator = new BABYLON.ShadowGenerator(1024, light2);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    
    // Create much larger water ground
    const ground = BABYLON.MeshBuilder.CreateGround("ground", {
        width: 1000,  // Increased from 200 to 1000
        height: 1000, // Increased from 200 to 1000
        subdivisions: 50 // More subdivisions for smoother waves over larger area
    }, scene);
    ground.receiveShadows = true;
    ground.position.y = -0.5;
    

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
                vertices[i + 1] = (Math.sin((x * waveScale) + (time * 2)) * 0.05) + 
                                 (Math.cos((z * waveScale) + (time * 1.5)) * 0.05);
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
            await modelLoader.loadModelsFromJson(jsonData);
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
    modelLoader = new ModelLoader(scene, statusElement);
    
    // Add random objects to the scene (rocks/obstacles)
    createRandomObjects(scene, 30, 100); // 30 objects in a 100x100 area
    
    // Load the default ship model
    try {
        const modelPath = 'Assets/3D/' + defaultShipConfig.models[0].path;
        const modelExists = await checkFileExists(modelPath);
        
        if (!modelExists) {
            throw new Error(`Model file not found at: ${modelPath}`);
        }
        
        statusElement.textContent = 'Loading pirate ship...';
        await modelLoader.loadModelsFromJson(defaultShipConfig);
        
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
        
        // Initialize ship controls first
        const shipControls = new ShipControls(scene, mainModel, {
            speed: 0.05,
            rotationSpeed: 0.02,
            maxSpeed: 0.3,
            friction: 0.98
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
        
        // Make camera a child of the ship
        try {
            // Camera setup - higher position with steeper angle
            camera.parent = mainModel;
            // Position camera higher (4x original height) and slightly closer for steeper angle
            camera.position = new BABYLON.Vector3(0, 40, -25);
            // Look at a point in front of the ship to create a steeper downward angle
            camera.setTarget(new BABYLON.Vector3(0, 0, 5));
            
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
        
        // Create bubble effect with dual trails
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
            sideOffset: 1.5,       // Distance from center to each side
            verticalOffset: -0.8,  // Slightly below the ship
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

// Create random square objects on the ground
function createRandomObjects(scene, count = 20, areaSize = 100) {
    const objects = [];
    const material = new BABYLON.StandardMaterial("rockMaterial", scene);
    material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    material.alpha = 0.9;
    
    for (let i = 0; i < count; i++) {
        // Random position within the area
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;
        
        // Random size variation
        const width = 1 + Math.random() * 3;
        const height = 0.5 + Math.random() * 2;
        const depth = 1 + Math.random() * 3;
        
        // Create box
        const box = BABYLON.MeshBuilder.CreateBox("rock_" + i, {
            width: width,
            height: height,
            depth: depth
        }, scene);
        
        // Position and rotate randomly
        box.position = new BABYLON.Vector3(x, height / 2, z);
        box.rotation = new BABYLON.Vector3(
            Math.random() * Math.PI * 0.2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 0.2
        );
        
        // Apply material with slight color variation
        const boxMaterial = material.clone("rockMaterial_" + i);
        const colorVariation = 0.7 + Math.random() * 0.3; // 0.7 to 1.0
        boxMaterial.diffuseColor = new BABYLON.Color3(
            0.5 * colorVariation,
            0.5 * colorVariation,
            0.5 * colorVariation
        );
        
        // Slight random roughness
        boxMaterial.roughness = 0.8 + Math.random() * 0.2;
        
        box.material = boxMaterial;
        box.receiveShadows = true;
        
        // Add physics if needed (uncomment if you want physics)
        // box.physicsImpostor = new BABYLON.PhysicsImpostor(
        //     box, 
        //     BABYLON.PhysicsImpostor.BoxImpostor, 
        //     { mass: 0, restitution: 0.1 }, 
        //     scene
        // );
        
        objects.push(box);
    }
    
    return objects;
}

// Start the application
window.addEventListener('DOMContentLoaded', initializeApp);
