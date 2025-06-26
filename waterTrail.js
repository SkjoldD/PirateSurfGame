export class WaterTrail {
    constructor(scene, ship, options = {}) {
        this.scene = scene;
        this.ship = ship;
        
        // Default options
        this.options = {
            minSpeed: 0.01,         // Minimum speed to show trail
            trailLength: 3.0,       // Increased base length of the trail
            maxLength: 100.0,         // Increased maximum length of the trail
            width: 2,             // Increased base width of the trail
            color: new BABYLON.Color3(0.4, 0.6, 1.0), // Brighter blue color
            alpha: 0.3,             // Increased base opacity
            ...options
        };
        
        // Initialize the trail
        this.initializeTrail();
    }
    
    initializeTrail() {
        console.log('Initializing water trail with options:', this.options);
        
        // Create a material for the trail
        this.material = new BABYLON.StandardMaterial("trailMaterial", this.scene);
        this.material.emissiveColor = this.options.color;
        this.material.diffuseColor = this.options.color;
        this.material.alpha = this.options.alpha;
        this.material.disableLighting = true;
        this.material.backFaceCulling = false;
        this.material.alphaMode = BABYLON.Engine.ALPHA_ADD;
        this.material.zOffset = -2; // Increased z-offset to ensure it's behind the ship
        this.material.freeze(); // Optimize material
        
        console.log('Created trail material:', this.material);
        
        // Create a dummy mesh that will be the source of the trail
        this.dummy = BABYLON.MeshBuilder.CreateBox("trailDummy", { size: 0.1 }, this.scene);
        this.dummy.isVisible = false; // Hide the dummy
        
        // Make the dummy a child of the ship so it follows it automatically
        this.dummy.parent = this.ship;
        console.log('Attached trail dummy to ship');
        
        // Ensure the dummy is positioned at the ship's origin
        this.dummy.position = new BABYLON.Vector3(0, 0, 0);
        
        // Position slightly behind the ship (local space)
        this.dummy.position.z = -1.0; // Behind the ship
        this.dummy.position.y = -0.5;  // Below the ship
        
        // Create the trail mesh with configurable width and length
        console.log('Creating trail mesh with width:', this.options.width, 'length:', this.options.trailLength);
        this.trail = new BABYLON.TrailMesh(
            "waterTrail",
            this.dummy,
            this.scene,
            this.options.width,  // Width of the trail
            this.options.maxLength,  // Maximum length of the trail
            false // Don't auto-start
        );
        
        // Set initial trail length
        this.trail.length = this.options.trailLength;
        
        // Make sure the trail is wide enough to be visible
        this.trail.width = this.options.width;
        
        if (!this.trail) {
            console.error('Failed to create trail mesh!');
            return;
        }
        
        console.log('Created trail mesh:', this.trail);
        
        // Position the trail slightly behind and below the ship
        this.dummy.position.y = -0.5; // Lower the trail to be more visible in water
        console.log('Dummy position set to:', this.dummy.position);
        
        // Configure trail appearance
        this.trail.material = this.material;
        console.log('Assigned material to trail');
        
        // Position is now handled by the parent-child relationship
        // Reset any previous position updates that might interfere
        this.dummy.position = new BABYLON.Vector3(0, -0.5, -1.0);
        this.dummy.rotation = new BABYLON.Vector3(0, 0, 0);
        
        console.log('Initial dummy position:', this.dummy.position);
        
        // Start the trail
        this.trail.start();
        console.log('Trail started');
    }
    
    update(deltaTime) {
        if (!this.ship) {
            console.error('No ship reference in water trail update');
            return;
        }
        if (!this.trail) {
            console.error('No trail mesh in water trail update');
            return;
        }
        
        // The dummy's position is now relative to the ship due to parent-child relationship
        // No need to manually update position here as it will follow the ship automatically
        
        // Update trail properties based on ship speed
        const speed = this.ship.getSpeed ? Math.abs(this.ship.getSpeed()) : 0;
        const isMoving = speed > this.options.minSpeed;
        
        // Adjust trail length based on speed
        if (isMoving) {
            // Scale trail length based on speed (up to maxLength)
            const targetLength = Math.min(
                this.options.trailLength * (speed / 2 + 0.5), // Scale with speed
                this.options.maxLength
            );
            
            // Smoothly interpolate to target length
            this.trail.length = BABYLON.Scalar.Lerp(
                this.trail.length || 0,
                targetLength,
                deltaTime * 2 // Adjust this value to control interpolation speed
            );
            
            // Make sure the trail is enabled
            this.trail.setEnabled(true);
        } else {
            // If not moving, fade out the trail
            this.trail.length = BABYLON.Scalar.Lerp(
                this.trail.length || 0,
                0,
                deltaTime * 2 // Fade out speed
            );
            
            // Disable the trail when it's very short
            if (this.trail.length < 0.1) {
                this.trail.setEnabled(false);
            }
        }
        
        // Debug log trail length
        if (performance.now() % 1000 < 16) { // Log once per second
            console.log('Trail length:', this.trail.length.toFixed(2), 
                       'Target max:', this.options.maxLength.toFixed(2));
        }
    }
    
    dispose() {
        // Clean up resources
        if (this.trail) {
            this.trail.dispose();
            this.trail = null;
        }
        
        if (this.dummy) {
            this.dummy.dispose();
            this.dummy = null;
        }
        
        if (this.material) {
            this.material.dispose();
            this.material = null;
        }
    }
}
