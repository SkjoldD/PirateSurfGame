export class ModelLoader {
    constructor(scene, statusElement, shadowGenerator = null) {
        this.scene = scene;
        this.statusElement = statusElement;
        this.mainModel = null; // Reference to the main model (pirate ship)
        this.shadowGenerator = shadowGenerator;
        
        // If no shadow generator provided, try to find one in the scene
        if (!this.shadowGenerator) {
            const light = this.scene.getLightByName("sunLight");
            if (light && light.shadowGenerator) {
                this.shadowGenerator = light.shadowGenerator;
                console.log('Found shadow generator on sunLight');
            }
        }
    }

    GetShadowGenerator() {
        // If we already have a shadow generator, return it
        if (this.shadowGenerator) {
            return this.shadowGenerator;
        }
        
        // Otherwise try to get it from the light
        const light = this.scene.getLightByName("sunLight");
        if (light && light.shadowGenerator) {
            console.log('Found shadow generator on sunLight');
            this.shadowGenerator = light.shadowGenerator;
            return this.shadowGenerator;
        }
        
        console.warn('Could not find shadow generator on sunLight');
        return null;
    }

    async loadModelsFromJson(jsonData, shadowGenerator) {
        // Clear existing models
        //this.clearExistingModels();
        
        const basePath = "Assets/3D/";
        
        try {
            const { models } = jsonData;
            console.log(`Loading ${models.length} models...`);
            
            for (const [index, modelData] of models.entries()) {
                await this.loadModel(modelData, basePath, index, models.length, this.shadowGenerator);
            }
            
            console.log(`Successfully loaded ${models.length} models`);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            console.error('Error loading scene: Invalid JSON format');
        }
    }

    clearExistingModels() {
        this.scene.meshes.forEach(mesh => {
            // Skip if this is a mesh we want to keep
            if (mesh.name === "ground" || 
                mesh.name === "__root__" || 
                mesh === this.mainModel ||
                this.isPartOfShip(mesh)) {
                return; // Skip this mesh
            }
            
            // For all other meshes, dispose them
            mesh.dispose();
        });
    }
    
    isPartOfShip(mesh) {
        // Check if mesh is the main model, a direct child, or a grandchild (for sails, etc.)
        if (mesh === this.mainModel) return true;
        
        // Check all ancestors up to the root
        let current = mesh;
        while (current.parent) {
            if (current.parent === this.mainModel) {
                return true;
            }
            current = current.parent;
        }
        
        return false;
    }

    async loadModel(modelData, basePath, index, totalModels, shadowGenerator) {
        try {
            // Clean and prepare the path
            let modelPath = modelData.path;
            
            // Remove any leading/trailing slashes and ensure proper path joining
            const cleanPath = modelPath.replace(/^[\\/]+|[\\/]+$/g, '');
            const fullPath = `${basePath}${cleanPath}`;
            
            // For GLB files, we need to handle the path differently
            let result;
            if (fullPath.endsWith('.glb') || fullPath.endsWith('.gltf')) {
                // For GLB/GLTF files, use ImportMesh with the full path
                result = await BABYLON.SceneLoader.ImportMeshAsync(
                    null, 
                    '', 
                    fullPath, 
                    this.scene
                );
            } else {
                // For other formats, split path and filename
                const lastSlash = fullPath.lastIndexOf('/');
                const path = fullPath.substring(0, lastSlash + 1);
                const file = fullPath.substring(lastSlash + 1);
                
                result = await BABYLON.SceneLoader.ImportMeshAsync(
                    null, 
                    path, 
                    file, 
                    this.scene
                );
            }
            
            if (!result || !result.meshes || result.meshes.length === 0) {
                throw new Error('No meshes found in the model');
            }
            
            
            // The first model is considered the main model
            const isMainModel = index === 0;
            this.configureModel(result.meshes[0], modelData, isMainModel);
            this.setupModelShadows(shadowGenerator, result.meshes, result.meshes[0]);
            
            // If this is the main model, store a reference
            if (isMainModel) {
                this.mainModel = result.meshes[0];
            }
            
        } catch (error) {
            console.error(`Error loading model ${modelPath}:`, error);
            console.error(`Error loading model: ${modelData.path}`);
        }
    }

    configureModel(root, modelData, isMainModel = false) {

        if (isMainModel) {
            root.name = 'mainModel';
        } else {
            root.name = `model_${Date.now()}`;
        }
        
        const position = new BABYLON.Vector3(...modelData.position);
        
        root.position = position ;
        
        // Apply 180 degree rotation on Y axis (π radians) to the model's rotation
        const rotation = [...modelData.rotation];
        rotation[1] += Math.PI; // Add π radians (180 degrees) to Y rotation
        root.rotation = new BABYLON.Vector3(...rotation);
        
        const scaling = new BABYLON.Vector3(...modelData.scaling);
        root.scaling = scaling;
        
        if (isMainModel) {
            this.mainModel = root;
            // Add a small animation to make the ship bob up and down slightly
            let time = 0;
            this.scene.registerBeforeRender(() => {
                if (this.mainModel) {
                    time += 0.01;
                    this.mainModel.position.y = modelData.position[1] + Math.sin(time) * 0.1;
                }
            });
        } else {
            // For non-main models, add physics collision
            this.setupModelCollision(root, position, scaling);
        }
    }
    
    // Get the main model for camera attachment
    getMainModel() {
        return this.mainModel;
    }

    setupModelCollision(root, position, scaling) {
        try {
            // Enable collision and shadows
            root.checkCollisions = true;
            root.receiveShadows = true;
            root.castShadows = true;
            
            // Make the mesh pickable for interaction
            root.isPickable = false;
            
            // Get the bounding box of the model
            const boundingBox = root.getBoundingInfo().boundingBox;
            const size = boundingBox.maximum.subtract(boundingBox.minimum);
            const center = boundingBox.minimum.add(size.scale(0.5));
            
            // Create a simple box collider
            const collider = BABYLON.MeshBuilder.CreateBox(
                `${root.name}_collider`,
                {
                    width: size.x * 1.1,
                    height: size.y * 1.1,
                    depth: size.z * 1.1,
                },
                this.scene
            );
            
            // Position the collider at the model's position
            collider.position = root.position.add(center);
            collider.rotation = root.rotation;
            collider.isVisible = true;  // Keep visible for debugging
            collider.isPickable = false;
            collider.checkCollisions = true;
            
            // Add physics impostor with mass 0 to make it static
            collider.physicsImpostor = new BABYLON.PhysicsImpostor(
                collider,
                BABYLON.PhysicsImpostor.BoxImpostor,
                { 
                    mass: 0,  // Mass of 0 makes it static
                    friction: 1.0,
                    restitution: 0.2,
                    nativeOptions: {
                        collisionFilterGroup: 1,
                        collisionFilterMask: 1,
                        material: {
                            friction: 1.0,
                            restitution: 0.2
                        }
                    }
                },
                this.scene
            );
            collider.physicsImpostor.forceUpdate();
            // Make the collider a child of the model
            collider.parent = root;
            
            // Add shadow casting if shadow generator is available
            if (this.shadowGenerator) {
                this.shadowGenerator.addShadowCaster(collider);
            }
            
            // Force update the physics
            setTimeout(() => {
                if (collider.physicsImpostor) {
                    collider.physicsImpostor.forceUpdate();
                }
            }, 100);
            
            
        } catch (error) {
            console.error('Error setting up collision for model:', root.name, error);
        }
        
    }
    
    setupModelShadows(shadowGenerator, meshes, root) {
        if (!shadowGenerator) {
            console.log(`Shadow generator not initialized`);
            return;
        }
        
        meshes.forEach(mesh => {
            if (mesh !== root) {
                try {
                    shadowGenerator.addShadowCaster(mesh, true);
                    mesh.receiveShadows = true;
                    mesh.castShadow = true;
                } catch (e) {
                    console.warn(`Failed to set up shadows for ${mesh.name}:`, e);
                }
            }
        });
    }

    // Status updates are now handled by console.log directly
}
