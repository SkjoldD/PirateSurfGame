export class ModelLoader {
    constructor(scene, statusElement) {
        this.scene = scene;
        this.statusElement = statusElement;
        this.mainModel = null; // Reference to the main model (pirate ship)
        this.glowLayer = new BABYLON.GlowLayer('glow', scene);
        this.glowLayer.intensity = 1.5; // Adjust glow intensity as needed
    }

    // Shadow functionality removed for better performance

    async loadModelsFromJson(jsonData) {
        // Clear existing models
        //this.clearExistingModels();
        
        const basePath = ""; // Path is now included in the model data
        const upgradeObjects = [];
        
        try {
            console.log('Raw JSON data received:', JSON.stringify(jsonData, null, 2).substring(0, 1000) + '...');
            const { objects } = jsonData;
            if (!Array.isArray(objects)) {
                console.error('Expected objects to be an array, got:', typeof objects);
                throw new Error('Invalid JSON format: expected objects array');
            }
            console.log(`Loading ${objects.length} models in parallel...`);
            
            // Log first few objects to check their structure
            console.log('Sample of first 3 objects:', objects.slice(0, 3).map(obj => ({
                name: obj.name,
                hasProperties: !!obj.properties,
                properties: obj.properties || {}
            })));
            
            // Show loading screen if available
            if (window.showLoadingScreen) {
                window.showLoadingScreen(`Loading ${objects.length} models...`);
            }
            
            // First pass: Create all models
            const loadPromises = objects.map((modelData, index) => {
                // Debug log for properties

                
                // Check if this is an upgrade object by looking for 'upgrade' in any property name or value
                const isUpgrade = modelData.properties && (
                    // Check if any property name contains 'upgrade'
                    Object.keys(modelData.properties).some(key => 
                        key.toLowerCase().includes('upgrade')
                    ) 
                );
                
                if (isUpgrade) {
                    console.log(`Found upgrade object: ${modelData.name || 'unnamed'}`);
                    modelData.isUpgrade = true;
                    // Store reference to process after all models are loaded
                    upgradeObjects.push({
                        modelData,
                        index
                    });
                }
                return this.loadModel(modelData, basePath, index, objects.length);
            });
            
            // Wait for all models to load in parallel
            const loadedMeshes = await Promise.all(loadPromises);
            
            // Process upgrade objects after all models are loaded
            console.log(`Found ${upgradeObjects.length} upgrade objects to process`);
            for (const { modelData, index } of upgradeObjects) {
                const mesh = loadedMeshes[index];
                console.log(`Processing upgrade object ${index}:`, mesh ? mesh.name : 'invalid mesh');
                if (mesh) {
                    console.log('Mesh details:', {
                        name: mesh.name,
                        position: mesh.position,
                        isUpgrade: mesh.isUpgrade,
                        parent: mesh.parent ? mesh.parent.name : 'none'
                    });
                    this.setupUpgradeJump(mesh);
                } else {
                    console.warn(`No mesh found for upgrade object at index ${index}`);
                }
            }
            
            
            // Set up collision detection for upgrades if we have a player mesh
            if (this.mainModel && upgradeObjects.length > 0) {
                this.setupUpgradeCollisions(this.mainModel, loadedMeshes.filter(m => m && m.isUpgrade));
            }
            
            // Hide loading screen when done
            if (window.hideLoadingScreen) {
                window.hideLoadingScreen();
            }
            
            return this.mainModel;
        } catch (error) {
            console.error('Error loading models:', error);
            if (window.showLoadingScreen) {
                window.showLoadingScreen('Error loading models. Please try again.');
            }
            throw error;
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
            const mesh = result.meshes[0];
        
            
            // Configure the model with the isMainModel flag
            this.configureModel(mesh, modelData, isMainModel);
            
            // If this is the main model, store a reference
            if (isMainModel) {
                this.mainModel = mesh;
                console.log('Main model set:', this.mainModel.name);
            }
            
            // Return the main mesh
            return result.meshes[0];
            
        } catch (error) {
            console.error(`Error loading model: ${modelData.path}`, error);
            return null;
        }
    }

    // Add a glowing star effect to a mesh
    addGlowEffect(mesh) {
        // Create a yellow emissive material for the glow
        const glowMaterial = new BABYLON.StandardMaterial('glowMaterial', this.scene);
        glowMaterial.emissiveColor = new BABYLON.Color3(1, 0.8, 0.3); // Yellow-orange glow
        glowMaterial.diffuseColor = new BABYLON.Color3(1, 0.9, 0.4);
        glowMaterial.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        glowMaterial.alpha = 0.8;
        
        // Create a slightly larger mesh for the glow effect
        const glowMesh = mesh.clone('glow_' + mesh.name);
        glowMesh.material = glowMaterial;
        glowMesh.scaling.scaleInPlace(1.1); // Slightly larger than original
        glowMesh.parent = mesh;
        
        // Add to glow layer
        this.glowLayer.addIncludedOnlyMesh(glowMesh);
        
        // Add pulsing animation
        let time = 0;
        scene.onBeforeRenderObservable.add(() => {
            if (!mesh.isDisposed && glowMesh) {
                time += 0.05;
                const scale = 1 + Math.sin(time) * 0.1; // Subtle pulsing effect
                glowMesh.scaling.set(scale, scale, scale);
            }
        });
        
        return glowMesh;
    }

    configureModel(root, modelData, isMainModel = false) {
        // Set the model name
        if (isMainModel) {
            root.name = 'mainModel';
        } else {
            root.name = modelData.name || `model_${Date.now()}`;
        }
        
        // Set position from the model data
        const position = new BABYLON.Vector3(
            modelData.position.x || 0,
            modelData.position.y || 0,
            modelData.position.z || 0
        );
        root.position = position;
        
        // Process properties if they exist
        if (modelData.properties) {
            // Store properties on the mesh for later use
            root.metadata = root.metadata || {};
            Object.assign(root.metadata, modelData.properties);
            
            // Check for upgrade properties
            const hasUpgradeProperty = Object.entries(modelData.properties).some(([key, value]) => {
                const keyStr = String(key).toLowerCase();
                const valueStr = String(value).toLowerCase();
                return keyStr.includes('upgrade') || valueStr.includes('upgrade');
            });
            
            if (hasUpgradeProperty) {
                console.log(`Adding glow effect to upgrade model: ${root.name}`);
                this.addGlowEffect(root);
                root.isUpgrade = true;
            }
            

            const hasSpawnProperty = Object.entries(modelData.properties).some(([key, value]) => {
                const keyStr = String(key).toLowerCase();
                const valueStr = String(value).toLowerCase();
                return keyStr.includes('spawn');
            });
            // Check for spawn point
            if (hasSpawnProperty) {
                console.log(`Found spawn point at position:`, position);
                // Store spawn position in the scene for later use
                this.scene._spawnPosition = position;
                // Emit event that spawn position was set
                const event = new CustomEvent('spawnPositionSet', { 
                    detail: { position: position }
                });
                document.dispatchEvent(event);
                
                // Hide the spawn point object
                root.isVisible = false;
                root.setEnabled(false);
            }
        }
        
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
        
        if (modelData.properties) {
        }
        else {
            console.log('No properties found');
        }

        // Check if this is a trigger object
        const isTrigger = modelData.properties && modelData.properties['is-trigger'] === 'true';
        
        // For trigger objects, skip the pop-in animation and set up immediately
        if (isTrigger) {
            console.log('Setting up trigger object immediately:', root.name);
            root.scaling = scaling;
            root.position = position;
            
            // Create a debug box for visualization
            const debugBox = this.createDebugBox(root);
            
            // Set up the action manager for this trigger
            this.setupActionManager(root, modelData, debugBox);
            return;
        }
        
        // For non-trigger objects, set up the pop-in animation
        root.scaling = BABYLON.Vector3.Zero();
        const startY = position.y - 1; // Start 1 unit below
        root.position.y = startY;
        // Create animation for the pop effect
        const popDuration = 0.8; // seconds
        const popStartTime = Date.now();
        // Animation function
        const animatePop = () => {
            // Animation implementation
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
                } else if (isTrigger) {
                    // Trigger objects are already set up immediately, nothing to do here
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
                
            // Position the collider at the model's position with y-offset
            collider.position = new BABYLON.Vector3(
                center.x,
                center.y + 0.5,  // Add 0.5 to Y position
                center.z
            );
            collider.rotation = BABYLON.Vector3.Zero();  // No additional rotation needed as it will inherit from parent
            collider.isVisible = false;  // Show physics collider for debugging
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
                            restitution: 0.2,
                            contactEquationStiffness: 1e8,
                            contactEquationRelaxation: 3
                        }
                    }
                },
                this.scene
            );
            collider.physicsImpostor.forceUpdate();
            // Make the collider a child of the model
            collider.parent = root;
                
            // Shadow functionality removed for better performance
                
            // Update material settings to prevent feedback loops
            const processMaterial = (material) => {
                if (!material) return;
                    
                // Disable any post-processes that might cause feedback loops
                material.disableDepthWrite = false;
                material.disableColorWrite = false;
                material.disableColorWrite = false;
                    
                // Ensure the material isn't using itself as a texture
                if (material.diffuseTexture && material.diffuseTexture === material.reflectionTexture) {
                    material.reflectionTexture = null;
                }
                    
                // Disable any render targets that might cause feedback
                if (material.getActiveTextures) {
                    const textures = material.getActiveTextures();
                    for (const texture of textures) {
                        if (texture && texture.isRenderTarget) {
                            texture.isRenderTarget = false;
                        }
                    }
                }
            };
            
        // Process all materials in the model
        const processNode = (node) => {
            if (node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(processMaterial);
                } else {
                    processMaterial(node.material);
                }
            }
                
            if (node.getChildren) {
                node.getChildren().forEach(processNode);
            }
        };
            
        processNode(root);
            
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

// Create a particle system for the upgrade effect
createUpgradeParticles(emitter) {
    console.log('Creating upgrade particles for emitter:', emitter.name);
    try {
        // Create a particle system
        const particleSystem = new BABYLON.ParticleSystem('upgradeParticles', 2000, this.scene);
            
        // Texture for particles (using a simple white dot)
        particleSystem.particleTexture = new BABYLON.Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFnSURBVFiF7ZaxSgNBFEXPvJndbH5iYxGwsrCx8QN8/gB/gJWVhYWFhYWFhYWFhYWFhYWFhYWFhYVFEkhiM7szz8JNEVJYJMGdeeXAwMDjcu+8N8wM/GvJXw9gZgK8A3fAEzABJkAFeAQuzWz8mzP9iHDOXQK3wC5QmNkCQES2gX3g2sxOf2OmHxHhArgG9oBXM5t/PTazN+AUOBCR89+Y6UfEGXAMvJjZ9GcBZjYF+sC+iJz8xEw/Is6BQ2BgZvPvCsxsBPSAAxG5+ImZfkRcAEfA0MxG3xWY2QjoAvsicvUTM/2IuAKOgVczG31XYGYDoAvsicj1T8z0I+IaOAFezez5uwIz6wFdYFdEbn5iph8RN8AJ8Gxmg+8KzOwR6AK7InL7EzP9iLgFToFnM+t/V2BmXaAH7IjI3U/M9CPiDjgDnsys912BmT0APWBbRO5/YqYfEffAOfBkZt3vCszsHugDWyLy8BMz/Yh4AC6Anpl1visws3ugD2yKyONPzPQjogNcAj0z63xXYGZ3wADYEJHOT8z0I6IDXAF9M2t/V2Bmt8AQ2BCR7k/M9COiC1wDAzNrfVdgZjfAEFgXkd5PzPQjogdcA0Mza31XYGY3wAhYF5H+T8z0I6IPXANDM2t+V2Bm18AIWBORwU/M9COiD1wBQzNrfFdgZlfACFgVkeFPzPQjYgBcAkMza3xXYGaXwBhYFZHRT8z0I2IIXAADM6t/V2BmF8AYWBGR8U/M9CNiBJwDAzOrfVdgZufAGFgWkclPzPQjYgycAQMzq31XYGZnwBhYEpHpT8z0I2ICnAJ9M6t+V2Bmp8AEWBKR2U/M9CNiCpwAfTOrfFdgZifABFgUkflPzPQjYgYcA30zK39XYGbHwBxYFJHFT8z0I2IOHAF9Myt9V2BmR8AcWBCRxU/M9CNiARwCPTMrfVdgZofAHFgQkcVPzPQjYgnsAz0zK31XYGYHwBxYEJHFb8z0I2IJ7AM9Myt9V2Bmu8AcWBCRxW/M9CNiCewBPTMrfVdgZrvAHFgQkcVvzPQjYgnsAD0zK31XYGY7wBxYEJHFb8z0I2IJ7AA9Myt9V2BmW8AcWBCRxW/M9CNiCWwDPTMrfVdgZlvAHFgQkcVvzPQjYglsAT0zK31XYGabwBxYEJHFb8z0I2IJbAI9Myt9V2BmG8AcWBCRxW/M9CNiCawDPTMrfVdgZuvAHFgQkcVvzPQjYgmsAT0zK31XYGZrwBxYEJHFb8z0I2IJrAI9Myt9V2Bmq8AcWBCRxW/M9CNiCawAPTM7/Ae9Kz4XaUa2nQAAAABJRU5ErkJggg==', this.scene);
        
        // Colors of all particles (golden color for upgrades)
        particleSystem.color1 = new BABYLON.Color4(1, 0.8, 0, 1.0);
        particleSystem.color2 = new BABYLON.Color4(1, 0.5, 0, 1.0);
        particleSystem.colorDead = new BABYLON.Color4(1, 0, 0, 0.0);
        
        // Size of particles
        particleSystem.minSize = 0.1;
        particleSystem.maxSize = 0.3;
        
        // Life time of particles
        particleSystem.minLifeTime = 0.5;
        particleSystem.maxLifeTime = 1.5;
        
        // Emission rate
        particleSystem.emitRate = 50;
        
        // Speed
        particleSystem.minEmitPower = 0.5;
        particleSystem.maxEmitPower = 1.5;
        particleSystem.updateSpeed = 0.02;
        
        // Direction
        particleSystem.direction1 = new BABYLON.Vector3(-0.5, -0.5, -0.5);
        particleSystem.direction2 = new BABYLON.Vector3(0.5, 0.5, 0.5);
        
        // Set emitter position
        particleSystem.emitter = emitter;
        
        return particleSystem;
        } catch (error) {
            console.error('Error creating upgrade particles:', error);
        }
    }
    
    // Create an explosion effect when collecting an upgrade
    createExplosionEffect(position) {
        if (!position) {
            console.error('Cannot create explosion effect: no position provided');
            return;
        }
        // Create a particle system
        const particleSystem = new BABYLON.ParticleSystem('explosionParticles', 2000, this.scene);
        
        // Texture for particles (using a simple white dot)
        particleSystem.particleTexture = new BABYLON.Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFnSURBVFiF7ZaxSgNBFEXPvJndbH5iYxGwsrCx8QN8/gB/gJWVhYWFhYWFhYWFhYWFhYWFhYWFhYVFEkhiM7szz8JNEVJYJMGdeeXAwMDjcu+8N8wM/GvJXw9gZgK8A3fAEzABJkAFeAQuzWz8mzP9iHDOXQK3wC5QmNkCQES2gX3g2sxOf2OmHxHhArgG9oBXM5t/PTazN+AUOBCR89+Y6UfEGXAMvJjZ9GcBZjYF+sC+iJz8xEw/Is6BQ2BgZvPvCsxsBPSAAxG5+ImZfkRcAEfA0MxG3xWY2QjoAvsicvUTM/2IuAKOgVczG31XYGYDoAvsicj1T8z0I+IaOAFezez5uwIz6wFdYFdEbn5iph8RN8AJ8Gxmg+8KzOwR6AK7InL7EzP9iLgFToFnM+t/V2BmXaAH7IjI3U/M9CPiDjgDnsys912BmT0APWBbRO5/YqYfEffAOfBkZt3vCszsHugDWyLy8BMz/Yh4AC6Anpl1visws3ugD2yKyONPzPQjogNcAj0z63xXYGZ3wADYEJHOT8z0I6IDXAF9M2t/V2Bmt8AQ2BCR7k/M9COiC1wDAzNrfVdgZjfAEFgXkd5PzPQjogdcA0Mza31XYGY3wAhYF5H+T8z0I6IPXANDM2t+V2Bm18AIWBORwU/M9COiD1wBQzNrfFdgZlfACFgVkeFPzPQjYgBcAkMza3xXYGaXwBhYFZHRT8z0I2IIXAADM6t/V2BmF8AYWBGR8U/M9CNiBJwDAzOrfVdgZufAGFgWkclPzPQjYgycAQMzq31XYGZnwBhYEpHpT8z0I2ICnAJ9M6t+V2Bmp8AEWBKR2U/M9CNiCpwAfTOrfFdgZifABFgUkflPzPQjYgYcA30zK39XYGbHwBxYFJHFT8z0I2IOHAF9Myt9V2BmR8AcWBCRxU/M9CNiARwCPTMrfVdgZofAHFgQkcVPzPQjYgnsAz0zK31XYGYHwBxYEJHFb8z0I2IJ7AM9Myt9V2Bmu8AcWBCRxW/M9CNiCewBPTMrfVdgZrvAHFgQkcVvzPQjYgnsAD0zK31XYGY7wBxYEJHFb8z0I2IJ7AA9Myt9V2BmW8AcWBCRxW/M9CNiCWwDPTMrfVdgZlvAHFgQkcVvzPQjYglsAT0zK31XYGabwBxYEJHFb8z0I2IJbAI9Myt9V2BmG8AcWBCRxW/M9CNiCawDPTMrfVdgZuvAHFgQkcVvzPQjYgmsAT0zK31XYGZrwBxYEJHFb8z0I2IJrAI9Myt9V2Bmq8AcWBCRxW/M9CNiCawAPTM7/Ae9Kz4XaUa2nQAAAABJRU5ErkJggg==', this.scene);
        
        // Colors of all particles (golden color for explosion)
        particleSystem.color1 = new BABYLON.Color4(1, 1, 0, 1.0);
        particleSystem.color2 = new BABYLON.Color4(1, 0.5, 0, 1.0);
        particleSystem.colorDead = new BABYLON.Color4(1, 0, 0, 0.0);
        
        // Size of particles
        particleSystem.minSize = 0.2;
        particleSystem.maxSize = 0.5;
        
        // Life time of particles
        particleSystem.minLifeTime = 0.3;
        particleSystem.maxLifeTime = 1.0;
        
        // Emission rate (single burst)
        particleSystem.emitRate = 100;
        
        // Speed
        particleSystem.minEmitPower = 2;
        particleSystem.maxEmitPower = 5;
        particleSystem.updateSpeed = 0.02;
        
        // Direction (explode in all directions)
        particleSystem.direction1 = new BABYLON.Vector3(-1, -1, -1);
        particleSystem.direction2 = new BABYLON.Vector3(1, 1, 1);
        
        // Set emitter position
        particleSystem.emitter = position;
        
        // Start the particle system
        particleSystem.start();
        
    }

    /**
     * Handles collection of an upgrade
     * @param {BABYLON.AbstractMesh} upgradeMesh - The upgrade mesh that was collected
     */
    collectUpgrade(upgradeMesh) {
        console.log('=== COLLECT UPGRADE ===');
        console.log('Upgrade mesh:', upgradeMesh ? upgradeMesh.name : 'null');
        
        if (!upgradeMesh) {
            console.error('Cannot collect upgrade: no mesh provided');
            return;
        }
        
        // Prevent double collection
        if (upgradeMesh.isCollected) {
            console.log('Upgrade already collected, ignoring');
            return;
        }
        
        // Mark as collected first to prevent double collection
        upgradeMesh.isCollected = true;
        
        try {
            console.log('Collecting upgrade:', upgradeMesh.name);
            
            // Handle different types of upgrades
            if (upgradeMesh.metadata && upgradeMesh.metadata.properties) {
                const props = upgradeMesh.metadata.properties;
                
                // Check for jump upgrade
                if (props['upgrade-jump']) {
                    const jumpValue = parseFloat(props['upgrade-jump']);
                    console.log(`Collected jump upgrade with value: ${jumpValue}`);
                    
                    // Enable jump ability through the global function
                    if (window.enableJumpAbility) {
                        window.enableJumpAbility();
                        console.log('Jump ability enabled!');
                    } else {
                        console.warn('enableJumpAbility function not found in global scope');
                    }
                }
            }
            
            // Store position before making any changes
            const position = upgradeMesh.getAbsolutePosition ? 
                upgradeMesh.getAbsolutePosition() : 
                upgradeMesh.position.clone();
                
            console.log('Creating explosion effect at:', position.toString());
            
            // Create explosion effect at the upgrade's position
            this.createExplosionEffect(position);
            
            // Hide and disable the mesh
            console.log('Hiding and disabling upgrade mesh:', upgradeMesh.name);
            upgradeMesh.setEnabled(false);
            upgradeMesh.isVisible = false;
            upgradeMesh.isPickable = false;
            
            // Stop and dispose of particle system if it exists
            if (upgradeMesh.particleSystem) {
                upgradeMesh.particleSystem.stop();
                upgradeMesh.particleSystem.dispose();
                upgradeMesh.particleSystem = null;
            }
            
            // Remove the upgrade mesh from the scene
            upgradeMesh.dispose();
            
            console.log('Upgrade collected and removed');
        } catch (error) {
            console.error('Error collecting upgrade:', error);
        }
    }
    /**
     * Sets up a floating animation for upgrade objects
     * @param {BABYLON.AbstractMesh} mesh - The upgrade mesh to animate
     */
    setupUpgradeJump(mesh) {
        if (!mesh) return;
        
        console.log(`Setting up jump animation for upgrade: ${mesh.name}`);
        
        // Store the original position for reference
        const originalPosition = mesh.position.clone();
        let time = 0;
        
        // Add the mesh to the glow layer
        if (this.glowLayer) {
            this.glowLayer.addIncludedOnlyMesh(mesh);
        }
        
        // Register a before render observer to animate the mesh
        this.scene.registerBeforeRender(() => {
            if (mesh.isDisposed) return;
            
            // Increment time
            time += 0.02;
            
            // Create a smooth up and down motion
            const height = 0.2; // Height of the bounce
            const speed = 1.5;  // Speed of the bounce
            mesh.position.y = originalPosition.y + Math.sin(time * speed) * height;
            
            // Add a slight rotation
            mesh.rotation.y += 0.01;
        });
    }
    
    /**
     * Creates a debug visualization box for trigger volumes
     * @param {BABYLON.AbstractMesh} mesh - The mesh to create a debug box for
     * @returns {BABYLON.Mesh} The debug box mesh
     */
    createDebugBox(mesh) {
        // Get the bounding box of the mesh
        const boundingBox = mesh.getBoundingInfo().boundingBox;
        const size = boundingBox.maximum.subtract(boundingBox.minimum);
        
        // Create a wireframe box for visualization
        const debugBox = BABYLON.MeshBuilder.CreateBox(
            `${mesh.name}_debug`,
            {
                width: size.x,
                height: size.y,
                depth: size.z,
                updatable: true
            },
            this.scene
        );
        
        // Position the debug box at the same position as the mesh
        debugBox.position = mesh.position.clone();
        
        // Make it semi-transparent red for visibility
        const debugMat = new BABYLON.StandardMaterial("debugMat", this.scene);
        debugMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
        debugMat.alpha = 0.3;
        debugMat.wireframe = true;
        debugBox.material = debugMat;
        
        // Make sure it doesn't interfere with physics
        debugBox.checkCollisions = false;
        debugBox.isPickable = false;
        
        // Make it a child of the trigger mesh
        debugBox.parent = mesh;
        
        return debugBox;
    }

    /**
     * Helper function to set up action manager based intersection
     * @param {BABYLON.AbstractMesh} triggerMesh - The trigger mesh to set up
     * @param {Object} modelData - The model data for the trigger
     * @param {BABYLON.Mesh} debugBox - Optional debug visualization box
     * @returns {BABYLON.AbstractMesh} The processed trigger mesh
     */
    setupActionManager(triggerMesh, modelData, debugBox) {
        console.log('Setting up ActionManager intersection for trigger:', triggerMesh.name);

        // Make sure both meshes have physics impostors for collision
        if (this.mainModel) {
            // Make sure both meshes are visible and enabled
            triggerMesh.isVisible = false; // Make the original trigger mesh invisible
            triggerMesh.isPickable = true;
            triggerMesh.isEnabled(true);

            // Make sure the main model is visible and enabled
            this.mainModel.isVisible = true;
            this.mainModel.isEnabled(true);

            // Enable debug visualization
            if (debugBox) {
                debugBox.isVisible = true;
            }

            // Enable physics on the trigger mesh if not already done
            if (!triggerMesh.physicsImpostor) {
                // First, ensure the mesh is ready for physics
                if (!triggerMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)) {
                    console.warn('Mesh has no vertices, cannot create physics impostor:', triggerMesh.name);
                    return triggerMesh;
                }

                // Create the physics impostor with appropriate options
                const options = {
                    mass: 0,                  // Static object
                    friction: 0.1,           // Low friction
                    restitution: 0.1,         // Low bounciness
                    ignoreParent: true,       // Don't inherit parent's physics
                    collisionResponse: false, // Don't respond to collisions physically
                    isTrigger: true,         // Mark as trigger
                    nativeOptions: {
                        collisionResponse: false,
                        isTrigger: true
                    }
                };

                // Create the impostor
                triggerMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
                    triggerMesh,
                    BABYLON.PhysicsImpostor.MeshImpostor,
                    options,
                    this.scene
                );
            }
            
            const pos = triggerMesh.position;
            console.log(`TRIGGER DEBUG: '${triggerMesh.name}' at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) with size x2`);
            return triggerMesh;
        }
    }

    /**
     * Creates a trigger for an upgrade object
     * @param {BABYLON.AbstractMesh} upgradeMesh - The upgrade mesh to create a trigger for
     * @param {BABYLON.AbstractMesh} playerMesh - The player's mesh
     */
    createUpgradeTrigger(upgradeMesh, playerMesh) {
        if (!upgradeMesh || !playerMesh) {
            console.error('Cannot create upgrade trigger: missing mesh or player mesh');
            return;
        }
        
        console.log(`=== CREATE UPGRADE TRIGGER ===`);
        console.log(`- Upgrade mesh: ${upgradeMesh.name}`);
        console.log(`- Player mesh: ${playerMesh.name}`);
        
        // Log upgrade mesh info
        const upgradeBoundingInfo = upgradeMesh.getBoundingInfo();
        console.log('Upgrade mesh info:', {
            position: upgradeMesh.position,
            boundingBox: upgradeBoundingInfo.boundingBox,
            boundingSphere: upgradeBoundingInfo.boundingSphere
        });
        
        // Log player mesh info
        console.log('Player mesh info:', {
            position: playerMesh.position,
            checkCollisions: playerMesh.checkCollisions,
            hasBoundingInfo: !!playerMesh.getBoundingInfo
        });
        
        // Store the original upgrade position for reference
        const originalPosition = upgradeMesh.position.clone();
        
        // Create a visible box for debugging that's slightly larger than the upgrade
        const size = upgradeBoundingInfo.boundingBox.extendSize.scale(1.5);
        console.log(`Creating trigger box with size: ${JSON.stringify({
            width: size.x * 2,
            height: size.y * 2,
            depth: size.z * 2
        })} at position: ${JSON.stringify(originalPosition)}`);
        
        // Create the trigger box
        const triggerBox = BABYLON.MeshBuilder.CreateBox(
            `${upgradeMesh.name}_trigger`,
            {
                width: size.x * 2,
                height: size.y * 2,
                depth: size.z * 2,
                updatable: true
            },
            this.scene
        );
        triggerBox.position.copyFrom(originalPosition);
        triggerBox.isPickable = false;
        
        // Make sure the trigger box has a bounding info
        triggerBox.refreshBoundingInfo(true);
        
        // Log trigger box info
        console.log('Trigger box created at:', triggerBox.position);
        
        // Create a highly visible material for the trigger
        const material = new BABYLON.StandardMaterial("triggerMaterial", this.scene);
        material.diffuseColor = new BABYLON.Color3(1, 0, 0); // Bright red
        material.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3); // Glowing red
        material.alpha = 0.7; // Mostly opaque
        material.wireframe = false;
        material.backFaceCulling = false; // Make it visible from all angles
        material.specularPower = 100;
        material.useEmissiveAsIllumination = true;
        
        // Add a second, larger wireframe box for better visibility
        const outlineBox = BABYLON.MeshBuilder.CreateBox(
            `${upgradeMesh.name}_outline`,
            {
                width: size.x * 2.2,
                height: size.y * 2.2,
                depth: size.z * 2.2,
                updatable: true
            },
            this.scene
        );
        outlineBox.position.copyFrom(upgradeMesh.position);
        const outlineMaterial = new BABYLON.StandardMaterial("outlineMaterial", this.scene);
        outlineMaterial.wireframe = true;
        outlineMaterial.emissiveColor = new BABYLON.Color3(1, 1, 0); // Bright yellow
        outlineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
        outlineMaterial.alpha = 0.9;
        outlineBox.material = outlineMaterial;
        
        // Add pulsing animation to the outline
        let pulseTime = 0;
        this.scene.registerBeforeRender(() => {
            if (outlineBox.isDisposed) return;
            pulseTime += 0.05;
            const pulse = 1 + Math.sin(pulseTime) * 0.2; // Pulsing effect
            outlineBox.scaling.set(pulse, pulse, pulse);
            
            // Make the main box flash
            const flash = 0.7 + Math.sin(pulseTime * 2) * 0.3;
            material.emissiveColor = new BABYLON.Color3(1, flash * 0.5, flash * 0.5);
        });
        
        // Store reference to outline for cleanup
        upgradeMesh._triggerOutline = outlineBox;
        triggerBox.material = material;
        
        console.log(`Created trigger box at position: ${JSON.stringify(triggerBox.position)}`);
        
        // Set up physics for the trigger
        console.log('Creating physics impostor for trigger box...');
        triggerBox.physicsImpostor = new BABYLON.PhysicsImpostor(
            triggerBox,
            BABYLON.PhysicsImpostor.BoxImpostor,
            { 
                mass: 0, 
                restitution: 0,
                onCollide: () => console.log('Collision detected!'),
                onCollideEvent: (e) => console.log('Collision event:', e)
            },
            this.scene
        );
        
        console.log('Trigger box physics impostor created:', {
            type: triggerBox.physicsImpostor.type,
            mass: triggerBox.physicsImpostor.mass
        });
        
        // Set up collision detection using scene's before render
        console.log('Setting up collision detection...');
        
        // Flag to prevent multiple collision detections
        let isProcessingCollision = false;
        
        // Add to scene's before render to check for collisions every frame
        const collisionObserver = this.scene.onBeforeRenderObservable.add(() => {
            if (isProcessingCollision || !playerMesh.getBoundingInfo) {
                return;
            }
            
            // Check if the player's bounding box intersects with the trigger box
            if (triggerBox.intersectsMesh(playerMesh, false)) {
                isProcessingCollision = true;
                console.log('COLLISION DETECTED with upgrade:', upgradeMesh.name);
                
                if (!upgradeMesh.isCollected) {
                    upgradeMesh.isCollected = true;
                    console.log('Processing upgrade collection...');
                    
                    // Process the upgrade
                    this.collectUpgrade(upgradeMesh);
                    
                    // Clean up the trigger after a short delay
                    setTimeout(() => {
                        console.log('Cleaning up trigger...');
                        
                        // Clean up the main trigger box
                        if (triggerBox.physicsImpostor) {
                            triggerBox.physicsImpostor.dispose();
                        }
                        triggerBox.dispose();
                        
                        // Clean up the outline box if it exists
                        if (upgradeMesh._triggerOutline) {
                            upgradeMesh._triggerOutline.dispose();
                            upgradeMesh._triggerOutline = null;
                        }
                        
                        // Remove this observer
                        this.scene.onBeforeRenderObservable.remove(collisionObserver);
                        
                        console.log('Trigger cleanup complete');
                    }, 100);
                }
                
                // Reset the flag after a short delay
                setTimeout(() => {
                    isProcessingCollision = false;
                }, 1000);
            }
        });
        
        console.log('Collision detection set up successfully using direct intersection check');
        
        // Store reference to the trigger on the upgrade mesh for cleanup
        upgradeMesh._triggerBox = triggerBox;
        
        // Make the trigger a child of the upgrade so it moves with it
        triggerBox.parent = upgradeMesh;
        
        return triggerBox;
    }

    /**
     * Sets up collision detection between the player and upgrade objects
     * @param {BABYLON.AbstractMesh} playerMesh - The player's mesh
     * @param {BABYLON.AbstractMesh[]} upgradeMeshes - Array of upgrade meshes
     */
    setupUpgradeCollisions(playerMesh, upgradeMeshes) {
        console.log('Setting up upgrade collisions for player mesh:', playerMesh.name);
        console.log('Number of upgrade meshes:', upgradeMeshes.length);
        
        // Make sure player mesh has an action manager
        if (!playerMesh.actionManager) {
            playerMesh.actionManager = new BABYLON.ActionManager(this.scene);
        }
        
        // Set up collision for each upgrade mesh
        upgradeMeshes.forEach((upgradeMesh, index) => {
            if (upgradeMesh && !upgradeMesh.isCollected) {
                console.log(`Setting up collision for upgrade ${index}:`, upgradeMesh.name);
                this.createUpgradeTrigger(upgradeMesh, playerMesh);
                
                // Also add a collision observer for physics-based collision
                upgradeMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
                    upgradeMesh,
                    BABYLON.PhysicsImpostor.BoxImpostor,
                    { mass: 0, restitution: 0.1 },
                    this.scene
                );
                
                upgradeMesh.physicsImpostor.registerOnPhysicsCollide(
                    playerMesh.physicsImpostor,
                    () => {
                        if (!upgradeMesh.isCollected) {
                            console.log('Physics collision detected with:', upgradeMesh.name);
                            this.collectUpgrade(upgradeMesh);
                        }
                    }
                );
            }
        });
        
        console.log('Upgrade collision setup complete');
    }
    
    /**
     * Clean up the trigger after a short delay
     * @param {BABYLON.AbstractMesh} triggerMesh - The trigger mesh to clean up
     */
    cleanupTrigger(triggerMesh) {
        try {
            if (!triggerMesh) return;
            
            console.log('Cleaning up trigger:', triggerMesh.name);
            
            // Clean up physics impostor if it exists
            if (triggerMesh.physicsImpostor) {
                triggerMesh.physicsImpostor.dispose();
                triggerMesh.physicsImpostor = null;
            }
            
            // Clean up physics box if it exists
            if (triggerMesh._physicsBox) {
                triggerMesh._physicsBox.dispose(false, true);
                triggerMesh._physicsBox = null;
            }
            
            // Clean up action manager
            if (triggerMesh.actionManager) {
                triggerMesh.actionManager.dispose();
                triggerMesh.actionManager = null;
            }
            
            // Finally, dispose the mesh itself if it still exists
            if (!triggerMesh.isDisposed()) {
                console.log('Removing trigger mesh from scene:', triggerMesh.name);
                triggerMesh.dispose(false, true);
            }
        } catch (e) {
            console.error('Error cleaning up trigger:', e);
        }
    }
}

export default ModelLoader;
