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
                    ) ||
                    // Or if any property value contains 'upgrade'
                    Object.values(modelData.properties).some(value => 
                        typeof value === 'string' && value.toLowerCase().includes('upgrade')
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
            console.error(`Error loading model ${modelPath}:`, error);
            console.error(`Error loading model: ${modelData.path}`);
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
            this.setupTrigger(root, modelData);
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
                console.log('Stopping and disposing particle system');
                try {
                    upgradeMesh.particleSystem.stop();
                    upgradeMesh.particleSystem.dispose();
                } catch (e) {
                    console.error('Error disposing particle system:', e);
                }
                upgradeMesh.particleSystem = null;
            }
            
            // Remove physics impostor if it exists
            if (upgradeMesh.physicsImpostor) {
                console.log('Disposing physics impostor');
                try {
                    upgradeMesh.physicsImpostor.dispose();
                } catch (e) {
                    console.error('Error disposing physics impostor:', e);
                }
                upgradeMesh.physicsImpostor = null;
            }
            
            // Remove action manager if it exists
            if (upgradeMesh.actionManager) {
                console.log('Disposing action manager');
                try {
                    upgradeMesh.actionManager.dispose();
                } catch (e) {
                    console.error('Error disposing action manager:', e);
                }
                upgradeMesh.actionManager = null;
            }
            
            // Show message to player
            if (window.showMessage) {
                try {
                    window.showMessage('Jump ability unlocked! Press SPACE to jump');
                } catch (e) {
                    console.error('Error showing message:', e);
                }
            } else {
                console.warn('window.showMessage function not found');
            }
            
            // Enable jump ability if available
            if (window.enableJumpAbility) {
                try {
                    console.log('Enabling jump ability');
                    window.enableJumpAbility();
                } catch (e) {
                    console.error('Error enabling jump ability:', e);
                }
            } else {
                console.warn('window.enableJumpAbility function not found');
            }
            
            console.log('Upgrade collection completed successfully');
            
            // Remove the mesh from the scene after a short delay
            setTimeout(() => {
                try {
                    if (upgradeMesh && !upgradeMesh.isDisposed()) {
                        console.log('Removing upgrade mesh from scene:', upgradeMesh.name);
                        upgradeMesh.dispose(false, true);
                    }
                } catch (e) {
                    console.error('Error removing upgrade mesh from scene:', e);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error during upgrade collection:', error);
            if (upgradeMesh) {
                console.error('Upgrade mesh state on error:', {
                    name: upgradeMesh.name,
                    isCollected: upgradeMesh.isCollected,
                    isVisible: upgradeMesh.isVisible,
                    isPickable: upgradeMesh.isPickable,
                    checkCollisions: upgradeMesh.checkCollisions,
                    hasParticles: !!upgradeMesh.particleSystem,
                    hasPhysics: !!upgradeMesh.physicsImpostor,
                    hasActionManager: !!upgradeMesh.actionManager,
                    isDisposed: upgradeMesh.isDisposed ? upgradeMesh.isDisposed() : 'unknown'
                });
            }
        }
    }

    // Create a trigger for when the player gets close to the upgrade
    createUpgradeTrigger(upgradeMesh, playerMesh) {
        if (!upgradeMesh || !playerMesh) return;
        
        const trigger = new BABYLON.ActionManager(this.scene);
        
        // Add an action to check for intersection with the player
        trigger.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                    trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger,
                    parameter: playerMesh
                },
                () => {
                    // Collect the upgrade when player touches it
                    if (!upgradeMesh.isCollected) {
                        this.collectUpgrade(upgradeMesh);
                    }
                }
            )
        );
        
        upgradeMesh.actionManager = trigger;
        return trigger;
    }

    // Set up upgrade jump functionality for a mesh
    setupUpgradeJump(mesh) {
        console.log('Setting up upgrade jump for mesh:', mesh.name);
        
        // Mark as an upgrade mesh
        mesh.isUpgrade = true;
        mesh.isCollected = false;
        
        // Make sure the mesh is pickable for collisions
        mesh.isPickable = true;
        mesh.checkCollisions = true;
        
        // Add a bounding box helper for debugging
        const bbox = mesh.getBoundingInfo().boundingBox;
        const size = bbox.maximum.subtract(bbox.minimum);
        const center = bbox.minimum.add(size.scale(0.5));
        
        // Create a collider for better collision detection
        const collider = BABYLON.MeshBuilder.CreateBox(
            `${mesh.name}_collider`,
            {
                width: size.x * 1.2,
                height: size.y * 1.2,
                depth: size.z * 1.2,
            },
            this.scene
        );
        
        // Position the collider at the mesh's position
        collider.position = center.clone();
        collider.isVisible = false;  // Make invisible
        collider.isPickable = true;
        collider.checkCollisions = true;
        collider.parent = mesh;
        
        // Add particle effect to make the upgrade more visible
        mesh.particleSystem = this.createUpgradeParticles(mesh);
        if (mesh.particleSystem) {
            mesh.particleSystem.start();
        }
        
        // Add a rotation animation
        this.scene.registerBeforeRender(() => {
            if (!mesh.isCollected) {
                mesh.rotation.y += 0.02;
            }
        });
        
        console.log('Upgrade jump setup complete for:', mesh.name);
    }
    
    // Set up a trigger object that will detect when the player enters its area
    setupTrigger(triggerMesh, modelData) {
        console.log('Setting up trigger:', triggerMesh.name);
        
        // Mark as a trigger for later reference
        triggerMesh.isTrigger = true;
        triggerMesh.isCollected = false;
        
        // Scale up the trigger mesh for better visibility
        triggerMesh.scaling.scaleInPlace(2.0);
        
        // Make the trigger visible and pickable for debugging
        triggerMesh.isVisible = true;
        triggerMesh.isPickable = true;
        triggerMesh.checkCollisions = true;
        
        // Add a debug material to visualize the trigger (semi-transparent red)
        const debugMaterial = new BABYLON.StandardMaterial('trigger-debug', this.scene);
        debugMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);
        debugMaterial.alpha = 0.5; // More visible
        debugMaterial.wireframe = true; // Add wireframe for better visibility
        debugMaterial.emissiveColor = new BABYLON.Color3(1, 0.5, 0.5); // Glowing effect
        debugMaterial.disableLighting = true; // Make sure it's always visible
        triggerMesh.material = debugMaterial;
        
        // Create an action manager for the trigger if it doesn't have one
        if (!triggerMesh.actionManager) {
            triggerMesh.actionManager = new BABYLON.ActionManager(this.scene);
        }
        
        // Function to handle trigger activation
        const onTriggerActivated = () => {
            // Prevent multiple triggers
            if (triggerMesh.isCollected) return;
            triggerMesh.isCollected = true;
            
            console.log(`Trigger activated: ${triggerMesh.name}`);
            
            // Hide and disable the trigger mesh
            triggerMesh.isVisible = false;
            triggerMesh.isPickable = false;
            
            // If there's a custom message in the properties, log it
            if (modelData.properties && modelData.properties.message) {
                console.log(`Trigger message: ${modelData.properties.message}`);
                if (window.showMessage) {
                    window.showMessage(modelData.properties.message);
                }
            }
            
            // If there's a custom function to call, execute it
            if (modelData.properties && modelData.properties.onTrigger) {
                try {
                    const func = new Function('scene', 'player', modelData.properties.onTrigger);
                    func(this.scene, this.mainModel);
                } catch (e) {
                    console.error('Error executing trigger function:', e);
                }
            }
            
            // Clean up the trigger after a short delay
            const cleanupTrigger = () => {
                try {
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
                    if (triggerMesh && !triggerMesh.isDisposed()) {
                        console.log('Removing trigger mesh from scene:', triggerMesh.name);
                        triggerMesh.dispose(false, true);
                    }
                } catch (e) {
                    console.error('Error cleaning up trigger:', e);
                }
            };
            
            // Schedule cleanup
            setTimeout(cleanupTrigger, 1000);
        };
        
        // Helper function to set up action manager based intersection
        const setupActionManager = () => {
            console.log('Setting up ActionManager intersection for trigger:', triggerMesh.name);
            
            // Make sure action manager exists
            if (!triggerMesh.actionManager) {
                triggerMesh.actionManager = new BABYLON.ActionManager(this.scene);
            }
            
            // Clear any existing actions to prevent duplicates
            triggerMesh.actionManager.registerAction(
                new BABYLON.ExecuteCodeAction(
                    {
                        trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger,
                        parameter: this.mainModel // Reference to the player's ship
                    },
                    () => {
                        console.log('ActionManager intersection detected for trigger:', triggerMesh.name);
                        onTriggerActivated();
                    }
                )
            );
            
            // Also check for intersection every frame as a fallback
            this.scene.registerBeforeRender(() => {
                if (triggerMesh.isCollected || !triggerMesh.actionManager) return;
                
                if (triggerMesh.intersectsMesh(this.mainModel, false)) {
                    console.log('Frame-based intersection detected for trigger:', triggerMesh.name);
                    onTriggerActivated();
                }
            });
        };
        
        // Set up ActionManager as primary collision detection
        setupActionManager();
        
        // Set up physics-based collision detection
        if (!triggerMesh.physicsImpostor) {
            // First, create a bounding box for better collision accuracy
            const boundingBox = triggerMesh.getBoundingInfo().boundingBox;
            const size = boundingBox.maximum.subtract(boundingBox.minimum);
            
            // Create a box mesh for the physics body that matches the trigger's size
            const physicsBox = BABYLON.MeshBuilder.CreateBox(`physics_${triggerMesh.name}`, {
                width: size.x * triggerMesh.scaling.x,
                height: size.y * triggerMesh.scaling.y,
                depth: size.z * triggerMesh.scaling.z
            }, this.scene);
            
            // Position the physics box at the same position as the trigger
            physicsBox.position = triggerMesh.position.clone();
            physicsBox.rotation = triggerMesh.rotation.clone();
            physicsBox.isVisible = false; // Hide the physics mesh
            physicsBox.parent = triggerMesh.parent; // Make sure it's in the same hierarchy
            
            // Create physics impostor for the trigger
            triggerMesh.physicsImpostor = new BABYLON.PhysicsImpostor(
                physicsBox, // Use the physics box instead of the trigger mesh
                BABYLON.PhysicsImpostor.BoxImpostor,
                { 
                    mass: 0, // Static object
                    friction: 0,
                    restitution: 0,
                    collisionResponse: true,
                    ignoreParent: true
                },
                this.scene
            );
            
            // Store reference to the physics box for cleanup
            triggerMesh._physicsBox = physicsBox;
            
            // Get the ship's collider (the physics body)
            const shipCollider = this.mainModel._collider || this.mainModel;
            
            if (shipCollider && shipCollider.physicsImpostor) {
                // Register collision callback between trigger and ship collider
                triggerMesh.physicsImpostor.registerOnPhysicsCollide(
                    shipCollider.physicsImpostor,
                    () => {
                        if (!triggerMesh.isCollected) {
                            console.group('TRIGGER ACTIVATED');
                            console.log('Trigger:', triggerMesh.name);
                            console.log('Position:', triggerMesh.position);
                            console.log('Ship Position:', this.mainModel.position);
                            console.log('Collision Detected at:', new Date().toISOString());
                            console.groupEnd();
                            onTriggerActivated();
                        }
                    }
                );
                
                console.log(`Registered physics collision for trigger: ${triggerMesh.name}`);
            } else {
                console.warn('Ship collider not found or has no physics impostor for trigger:', triggerMesh.name);
                // Fall back to ActionManager if physics isn't available
                setupActionManager();
            }
        }
        
        console.group('Trigger Setup Complete');
        console.log('Name:', triggerMesh.name);
        console.log('Position:', triggerMesh.position);
        console.log('Scaling:', triggerMesh.scaling);
        console.log('Bounding Box:', triggerMesh.getBoundingInfo().boundingBox);
        console.log('Physics Impostor:', triggerMesh.physicsImpostor ? 'Exists' : 'Missing');
        console.groupEnd();
        
        // Log trigger position for debugging
        const pos = triggerMesh.position;
        console.log(`TRIGGER DEBUG: '${triggerMesh.name}' at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) with size x2`);
        return triggerMesh;
    }
    
    // Set up collision detection between player and upgrade meshes
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
}

// Status updates are now handled by console.log directly
