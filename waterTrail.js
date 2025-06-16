class WaterTrail {
    constructor(scene, ship, options = {}) {
        this.scene = scene;
        this.ship = ship;
        
        // Default options
        this.options = {
            maxTrailLength: 20,      // Maximum number of trail segments
            segmentLifetime: 1.5,    // How long each segment stays visible (seconds)
            width: 2,               // Base width of the trail
            maxWidth: 5,            // Maximum width when at full speed
            minSpeed: 0.05,         // Minimum speed to start showing trail
            maxSpeed: 0.3,          // Speed at which trail reaches max width
            color: new BABYLON.Color4(0.5, 0.7, 1, 0.6), // Light blue with transparency
            ...options
        };
        
        // Trail data
        this.trailSegments = [];
        this.trailMesh = null;
        this.positions = [];
        this.indices = [];
        this.colors = [];
        
        // Initialize the trail
        this.initializeTrail();
    }
    
    initializeTrail() {
        // Create a custom mesh for the trail
        const trailMesh = new BABYLON.Mesh('waterTrail', this.scene);
        trailMesh.isPickable = false; // Improve performance
        
        // Create a material for the trail
        const material = new BABYLON.StandardMaterial('waterTrailMaterial', this.scene);
        material.emissiveColor = new BABYLON.Color3(0.5, 0.7, 1);
        material.alpha = 0.6;
        material.specularPower = 0; // No specular highlights
        material.disableLighting = true; // Trail is self-illuminated
        material.backFaceCulling = false; // Show from both sides
        material.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending
        
        trailMesh.material = material;
        
        this.trailMesh = trailMesh;
    }
    
    update(deltaTime) {
        if (!this.ship || !this.trailMesh) return;
        
        const currentTime = performance.now() / 1000; // Current time in seconds
        const shipSpeed = this.ship.getSpeed ? this.ship.getSpeed() : 0;
        
        // Add new segment if moving fast enough
        if (shipSpeed > this.options.minSpeed) {
            // Calculate width based on speed
            const speedRatio = Math.min(1, (shipSpeed - this.options.minSpeed) / 
                                      (this.options.maxSpeed - this.options.minSpeed));
            const segmentWidth = this.options.width + 
                              (this.options.maxWidth - this.options.width) * speedRatio;
            
            // Get ship position and direction
            const position = this.ship.position.clone();
            position.y = 0; // Keep trail at water level
            
            // Add new segment
            this.trailSegments.unshift({
                position: position,
                width: segmentWidth,
                time: currentTime,
                alpha: 1.0
            });
        }
        
        // Remove old segments
        while (this.trailSegments.length > 0 && 
               currentTime - this.trailSegments[this.trailSegments.length - 1].time > this.options.segmentLifetime) {
            this.trailSegments.pop();
        }
        
        // Limit number of segments
        while (this.trailSegments.length > this.options.maxTrailLength) {
            this.trailSegments.pop();
        }
        
        // Update existing segments
        for (let i = 0; i < this.trailSegments.length; i++) {
            const segment = this.trailSegments[i];
            const age = currentTime - segment.time;
            segment.alpha = 1.0 - (age / this.options.segmentLifetime);
        }
        
        // Rebuild the trail mesh
        this.updateTrailMesh();
    }
    
    updateTrailMesh() {
        if (this.trailSegments.length < 2) {
            this.trailMesh.setEnabled(false);
            return;
        }
        
        this.trailMesh.setEnabled(true);
        
        // Clear previous data
        this.positions = [];
        this.indices = [];
        this.colors = [];
        
        const color = this.options.color;
        
        // Create ribbon path
        const path = [];
        
        // Add points for each segment
        for (let i = 0; i < this.trailSegments.length; i++) {
            const segment = this.trailSegments[i];
            const direction = this.getSegmentDirection(i);
            
            // Calculate perpendicular vector for trail width
            const perpendicular = new BABYLON.Vector3(-direction.z, 0, direction.x)
                .normalize()
                .scale(segment.width * 0.5);
            
            // Add left and right points
            path.push([
                segment.position.add(perpendicular),
                segment.position.subtract(perpendicular)
            ]);
            
            // Add colors with alpha based on segment age
            const alpha = color.a * segment.alpha;
            this.colors.push(
                color.r, color.g, color.b, alpha,
                color.r, color.g, color.b, alpha
            );
        }
        
        // Create ribbon from path
        BABYLON.VertexData.CreateRibbon({
            pathArray: path,
            closeArray: false,
            closePath: false,
            offset: 0,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }).applyToMesh(this.trailMesh, true);
        
        // Apply colors
        const vertexData = BABYLON.VertexData.ExtractFromMesh(this.trailMesh, true, true);
        vertexData.colors = this.colors;
        vertexData.applyToMesh(this.trailMesh);
    }
    
    getSegmentDirection(segmentIndex) {
        if (this.trailSegments.length < 2) {
            return new BABYLON.Vector3(0, 0, 1);
        }
        
        const current = this.trailSegments[segmentIndex].position;
        let nextIndex = segmentIndex + 1;
        
        // Find the next valid segment
        while (nextIndex < this.trailSegments.length - 1 && 
               this.trailSegments[nextIndex].position.subtract(current).lengthSquared() < 0.01) {
            nextIndex++;
        }
        
        if (nextIndex >= this.trailSegments.length) {
            return this.ship.forward || new BABYLON.Vector3(0, 0, 1);
        }
        
        // Calculate direction to next point
        const next = this.trailSegments[nextIndex].position;
        return next.subtract(current).normalize();
    }
    
    dispose() {
        if (this.trailMesh) {
            this.trailMesh.dispose();
            this.trailMesh = null;
        }
    }
}
