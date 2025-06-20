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
        
        const basePath = ""; // Path is now included in the model data
        
        try {
            const { objects } = jsonData;
            console.log(`Loading ${objects.length} models in parallel...`);
            
            // Create an array of promises for all model loads
            const loadPromises = objects.map((modelData, index) => 
                this.loadModel(modelData, basePath, index, objects.length, this.shadowGenerator)
            );
            
            // Wait for all models to load in parallel
            await Promise.all(loadPromises);
            
            console.log(`Successfully loaded ${objects.length} models`);
            
            // Return the main model (first model) if needed
            return this.mainModel;
        } catch (error) {
            console.error('Error loading models:', error);
            throw error; // Re-throw to allow handling by the caller
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
        
            // Configure the model with the isMainModel flag
            this.configureModel(result.meshes[0], modelData, isMainModel);
        
            // Set up shadows for all meshes
            this.setupModelShadows(shadowGenerator, result.meshes, result.meshes[0]);
        
            // If this is the main model, store a reference
            if (isMainModel) {
                this.mainModel = result.meshes[0];
                console.log('Main model set:', this.mainModel.name);
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
        
        // Set position from the new structure
        const position = new BABYLON.Vector3(
            modelData.position.x || 0,
            modelData.position.y || 0,
            modelData.position.z || 0
        );
        root.position = position;
        
        // Set rotation from the new structure
        if (modelData.rotationQuaternion) {
            // Use quaternion if available
            root.rotationQuaternion = new BABYLON.Quaternion(
                modelData.rotationQuaternion.x || 0,
                modelData.rotationQuaternion.y || 0,
                modelData.rotationQuaternion.z || 0,
                modelData.rotationQuaternion.w !== undefined ? modelData.rotationQuaternion.w : 1
            );
        } else {
            // Fall back to euler angles if quaternion not available
            const rotation = new BABYLON.Vector3(
                modelData.rotation ? (modelData.rotation.x || 0) : 0,
                modelData.rotation ? ((modelData.rotation.y || 0) + Math.PI) : Math.PI, // Add 180 degrees to Y rotation
                modelData.rotation ? (modelData.rotation.z || 0) : 0
            );
            root.rotation = rotation;
        }
        
        // Apply default scaling if not specified in the model data
        const scaling = new BABYLON.Vector3(1, 1, 1);
        if (modelData.scaling) {
            scaling.set(
                modelData.scaling.x || 1, 
                modelData.scaling.y || 1, 
                modelData.scaling.z || 1
            );
        }
        // Store the original scale for animation
        const originalScaling = scaling.clone();
        
        // Set initial scale to 0 and position slightly below
        root.scaling = BABYLON.Vector3.Zero();
        const startY = position.y - 1; // Start 1 unit below
        root.position.y = startY;
        
        // Create animation for the pop effect
        const popDuration = 0.8; // seconds
        const popStartTime = Date.now();
        
        // Store the original position for the main model's bobbing animation
        // Note: We set this.mainModel in loadModel instead to avoid race conditions
        
        // Animation function
        const animatePop = () => {
            const elapsed = (Date.now() - popStartTime) / 1000; // Convert to seconds
            const progress = Math.min(elapsed / popDuration, 1); // Clamp to 0-1
            
            // Ease-out function for smooth deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            // Scale animation: grow to 120%, then settle back to 100%
            let scaleFactor = 1.0;
            if (progress < 0.6) {
                // First 60% of animation: grow to 120%
                scaleFactor = 1.0 + (0.2 * (progress / 0.6));
            } else {
                // Last 40%: shrink back to 100%
                scaleFactor = 1.2 - (0.2 * ((progress - 0.6) / 0.4));
            }
            
            // Apply scaling
            root.scaling = new BABYLON.Vector3(
                originalScaling.x * scaleFactor,
                originalScaling.y * scaleFactor,
                originalScaling.z * scaleFactor
            );
            
            // Move up animation
            root.position.y = startY + (position.y - startY) * easeOut;
            
            // If animation is complete, clean up or set final values
            if (progress < 1) {
                requestAnimationFrame(animatePop);
            } else {
                // Animation complete
                root.scaling = originalScaling;
                root.position.y = position.y;
                
                // For main model, start bobbing animation and enable controls
                if (isMainModel) {
                    let time = 0;
                    this.scene.registerBeforeRender(() => {
                        if (this.mainModel) {
                            time += 0.01;
                            this.mainModel.position.y = position.y + Math.sin(time) * 0.1;
                        }
                    });
                    
                    console.log('Main model pop-in animation complete, enabling ship controls...');
                    
                    // Enable ship controls after pop-in animation
                    if (typeof window.enableShipControls === 'function') {
                        setTimeout(() => {
                            window.enableShipControls();
                            console.log('Ship controls enabled');
                        }, 100); // Small delay to ensure everything is ready
                    } else {
                        console.warn('enableShipControls function not found on window');
                    }
                } else {
                    // For non-main models, add physics collision after pop-in
                    this.setupModelCollision(root, position, originalScaling);
                }
            }
        };
        
        // Start the animation
        animatePop();
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
            // The collider is already created relative to the model's origin
            // Just make it a child of the model and it will inherit the position/rotation
            collider.position = center;  // Local position relative to parent
            collider.rotation = BABYLON.Vector3.Zero();  // No additional rotation needed as it will inherit from parent
            collider.isVisible = false;  // Hide physics collider
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
