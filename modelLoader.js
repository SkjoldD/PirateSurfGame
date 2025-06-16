export class ModelLoader {
    constructor(scene, statusElement) {
        this.scene = scene;
        this.statusElement = statusElement;
        this.shadowGenerator = null;
        this.mainModel = null; // Reference to the main model (pirate ship)
        this.initializeShadowGenerator();
    }

    initializeShadowGenerator() {
        const light = this.scene.getLightByName("light2");
        if (light) {
            this.shadowGenerator = light.shadowGenerator;
        }
    }

    async loadModelsFromJson(jsonData) {
        // Clear existing models
        this.clearExistingModels();
        
        const basePath = "Assets/3D/";
        
        try {
            const { models } = jsonData;
            this.updateStatus(`Loading ${models.length} models...`);
            
            for (const [index, modelData] of models.entries()) {
                await this.loadModel(modelData, basePath, index, models.length);
            }
            
            this.updateStatus(`Successfully loaded ${models.length} models`);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            this.updateStatus('Error loading scene: Invalid JSON format');
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

    async loadModel(modelData, basePath, index, totalModels) {
        try {
            // Clean and prepare the path
            let modelPath = modelData.path;
            
            // Remove any leading/trailing slashes and ensure proper path joining
            const cleanPath = modelPath.replace(/^[\\/]+|[\\/]+$/g, '');
            const fullPath = `${basePath}${cleanPath}`;
            
            console.log(`Loading model from: ${fullPath}`);
            
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
            
            console.log('Model loaded successfully:', result.meshes.length, 'meshes');
            
            // The first model is considered the main model
            const isMainModel = index === 0;
            this.configureModel(result.meshes[0], modelData, isMainModel);
            this.setupModelShadows(result.meshes, result.meshes[0]);
            
            // If this is the main model, store a reference
            if (isMainModel) {
                this.mainModel = result.meshes[0];
                console.log('Main model set:', this.mainModel);
            }
            
            this.updateStatus(`Loaded ${index + 1}/${totalModels} models`);
        } catch (error) {
            console.error(`Error loading model ${modelPath}:`, error);
            this.updateStatus(`Error loading model: ${modelData.path}`);
        }
    }

    configureModel(root, modelData, isMainModel = false) {
        root.name = isMainModel ? 'mainModel' : `model_${Date.now()}`;
        root.position = new BABYLON.Vector3(...modelData.position);
        
        // Apply 180 degree rotation on Y axis (π radians) to the model's rotation
        const rotation = [...modelData.rotation];
        rotation[1] += Math.PI; // Add π radians (180 degrees) to Y rotation
        root.rotation = new BABYLON.Vector3(...rotation);
        
        root.scaling = new BABYLON.Vector3(...modelData.scaling);
        
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
        }
    }
    
    // Get the main model for camera attachment
    getMainModel() {
        return this.mainModel;
    }

    setupModelShadows(meshes, root) {
        if (!this.shadowGenerator) return;
        
        meshes.forEach(mesh => {
            if (mesh !== root) {
                this.shadowGenerator.addShadowCaster(mesh, true);
                mesh.receiveShadows = true;
            }
        });
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }
}
