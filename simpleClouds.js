class SimpleClouds {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.clouds = [];
        this.reflectionProbe = options.reflectionProbe; // Store reference to reflection probe
        this.scene = scene;
        this.clouds = [];
        
        // Default options
        this.options = {
            minX: -100,           // Min X position
            maxX: 100,            // Max X position
            minZ: -100,           // Min Z position (depth)
            maxZ: 100,            // Max Z position (depth)
            minY: 35,             // Min height
            maxY: 45,             // Max height
            minSize: 10,          // Min cloud size
            maxSize: 30,          // Max cloud size
            speed: 0.2,           // Movement speed
            spawnInterval: 5000,   // Time between new clouds (ms)
            lifeTime: 30000
        };
        
        this.init();
    }
    
    init() {
        // Create cloud material
        this.cloudMaterial = new BABYLON.StandardMaterial("cloudMat", this.scene);
        this.cloudMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        this.cloudMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        this.cloudMaterial.alpha = 0.8; // Slightly transparent
        this.cloudMaterial.backFaceCulling = false; // Make visible from both sides
        
        // Start spawning clouds
        this.spawnCloud();
        setInterval(() => this.spawnCloud(), this.options.spawnInterval);
        
        // Animation loop
        this.scene.registerBeforeRender(() => this.update());
    }
    
    spawnCloud() {
        // Random position
        const x = this.options.minX;
        const y = this.options.minY;
        const z = this.options.minZ + Math.random() * (this.options.maxZ - this.options.minZ);
        
        // Create a new material for this cloud
        const cloudMaterial = new BABYLON.StandardMaterial("cloudMat" + Date.now(), this.scene);
        cloudMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // Pure white
        cloudMaterial.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9); // Slight glow for whiteness
        cloudMaterial.specularColor = new BABYLON.Color3(0, 0, 0); // No specular highlights
        cloudMaterial.alpha = 0; // Start transparent for fade in
        
        // Transparency settings
        cloudMaterial.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        cloudMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; // Best for smooth transparency
        cloudMaterial.useAlphaFromDiffuseTexture = false;
        cloudMaterial.disableDepthWrite = true; // Important for proper transparency
        cloudMaterial.backFaceCulling = false; // Render both sides
        
        // Shadow settings - only cast, don't receive
        cloudMaterial.forceDepthWrite = true;
        cloudMaterial.freeze(); // Improve performance
        
        // Random size
        const size = this.options.minSize + Math.random() * (this.options.maxSize - this.options.minSize);
        
        // Create a flat box for the cloud
        const cloud = BABYLON.MeshBuilder.CreateBox('cloud', {
            width: size,
            height: size * 0.2,  // Make it flat
            depth: size * 0.8
        }, this.scene);
        
        // Position and rotate randomly for natural look
        cloud.position = new BABYLON.Vector3(x, y, z);
        cloud.rotation.y = Math.random() * Math.PI * 2; // Random rotation
        
        // Apply material
        cloud.material = cloudMaterial;
        
        // Shadows disabled for better performance
        
        // Store cloud data
        const cloudData = {
            mesh: cloud,
            speed: this.options.speed * (0.8 + Math.random() * 0.4), // Random speed variation
            spawnTime: Date.now(),
            targetX: this.options.maxX + size // Target X position to reach before removal
        };
        
        // Add cloud to reflection probe if available
        if (this.reflectionProbe && this.reflectionProbe.renderList) {
            this.reflectionProbe.renderList.push(cloud);
        }
        
        this.clouds.push(cloudData);
    }
    
    update() {
        const now = Date.now();
        const cloudsToRemove = [];
        
        this.clouds.forEach((cloud, index) => {
            if (!cloud.mesh || !cloud.mesh.material) {
                cloudsToRemove.unshift(index);
                return;
            }
            
            // Move cloud
            cloud.mesh.position.x += cloud.speed * this.scene.getEngine().getDeltaTime() * 0.1;
            
            // Calculate fade in/out
            const aliveTime = now - cloud.spawnTime;
            const fadeInDuration = 2000; // 2 seconds to fade in
            const fadeOutStart = this.options.lifeTime - 5000; // Start fading out 5 seconds before end
            
            // Handle fade in
            if (aliveTime < fadeInDuration) {
                cloud.mesh.material.alpha = 0.8 * (aliveTime / fadeInDuration);
            } 
            // Handle fade out
            else if (aliveTime > fadeOutStart) {
                const fadeOutProgress = (aliveTime - fadeOutStart) / 5000;
                cloud.mesh.material.alpha = 0.8 * (1 - fadeOutProgress);
            }
            
            // Remove if out of bounds or lifetime expired
            if (cloud.mesh.position.x > cloud.targetX || aliveTime > this.options.lifeTime) {
                // Remove from reflection probe if it exists
                if (this.reflectionProbe && this.reflectionProbe.renderList) {
                    const renderList = this.reflectionProbe.renderList;
                    const indexInRenderList = renderList.indexOf(cloud.mesh);
                    if (indexInRenderList !== -1) {
                        renderList.splice(indexInRenderList, 1);
                    }
                }
                
                // Dispose the mesh
                cloud.mesh.dispose();
                cloudsToRemove.unshift(index); // Add to beginning to avoid index shifting
            }
        });
        
        // Remove disposed clouds
        cloudsToRemove.forEach(index => {
            this.clouds.splice(index, 1);
        });
    }
    
    dispose() {
        // Clean up all clouds
        this.clouds.forEach(cloud => cloud.mesh.dispose());
        this.clouds = [];
        this.cloudMaterial.dispose();
    }
}

export { SimpleClouds };
