export class ShipControls {
    constructor(scene, shipMesh, options = {}) {
        this.scene = scene;
        this.ship = shipMesh;
        
        // Initialize movement properties
        this.velocity = new BABYLON.Vector3();
        this.rotationVelocity = 0;
        this.forward = new BABYLON.Vector3(0, 0, 1);
        
        // Add methods to ship mesh
        Object.defineProperty(this.ship, 'getSpeed', {
            value: () => this.velocity.length(),
            enumerable: false,
            configurable: true
        });
        
        Object.defineProperty(this.ship, 'forward', {
            get: () => this.forward,
            enumerable: false,
            configurable: true
        });
        
        // Movement settings
        this.speed = options.speed || 0.1;
        this.rotationSpeed = options.rotationSpeed || 0.03;
        this.maxSpeed = options.maxSpeed || 0.5;
        this.friction = options.friction || 0.95;
        
        // Movement state
        this.velocity = new BABYLON.Vector3(0, 0, 0);
        this.rotationVelocity = 0;
        this.moveDirection = new BABYLON.Vector3(0, 0, 1);
        
        // Input state
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            shift: false
        };
        
        // Initialize controls
        this.attachControls();
        
        // Add update to the scene's render loop
        scene.registerBeforeRender(this.update.bind(this));
    }
    
    attachControls() {
        // Keyboard input handling
        const onKeyDown = (evt) => {
            const key = evt.key.toLowerCase();
            if (key in this.keys) {
                this.keys[key] = true;
            } else if (key === 'shift') {
                this.keys.shift = true;
            }
        };
        
        const onKeyUp = (evt) => {
            const key = evt.key.toLowerCase();
            if (key in this.keys) {
                this.keys[key] = false;
            } else if (key === 'shift') {
                this.keys.shift = false;
            }
        };
        
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        
        // Cleanup on dispose
        this.scene.onDispose = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }
    
    update() {
        if (!this.ship) return;
        
        try {
            // Get delta time for frame-rate independent movement
            const deltaTime = this.scene.getEngine().getDeltaTime() / 1000; // Convert to seconds
            
            // Calculate movement direction based on ship's rotation
            const rotationMatrix = BABYLON.Matrix.RotationY(this.ship.rotation.y);
            const forward = new BABYLON.Vector3(0, 0, 1);
            const right = new BABYLON.Vector3(1, 0, 0);
            
            // Transform vectors based on ship's rotation
            const forwardDirection = BABYLON.Vector3.TransformNormal(forward, rotationMatrix);
            const rightDirection = BABYLON.Vector3.TransformNormal(right, rotationMatrix);
            
            // Handle movement
            const moveDirection = new BABYLON.Vector3(0, 0, 0);
            
            // Forward/Backward
            if (this.keys.w) moveDirection.addInPlace(forwardDirection);
            if (this.keys.s) moveDirection.subtractInPlace(forwardDirection);
            
            // Rotation (A/D keys)
            let rotationDelta = 0;
            let leftRotation = true;
            if (this.keys.a) {
                rotationDelta += this.rotationSpeed * deltaTime * 60; // Positive for left rotation
                leftRotation = true;
            }
            if (this.keys.d) {
                rotationDelta += this.rotationSpeed * deltaTime * 60; // Negative for right rotation
                leftRotation = false;
            }
            
            // Apply rotation
            if (rotationDelta !== 0) {
                if (leftRotation){
                    this.ship.rotation.y -= rotationDelta;
                }else{
                    this.ship.rotation.y += rotationDelta;
                }
            }
            
            // Apply movement if there's any input
            if (moveDirection.lengthSquared() > 0) {
                moveDirection.normalize();
                const speedMultiplier = this.keys.shift ? 1.5 : 1.0;
                const acceleration = this.speed * speedMultiplier * deltaTime * 60; // Scale by delta time and 60 FPS
                this.velocity.addInPlace(moveDirection.scale(acceleration));
            }
            
            // Apply friction
            this.velocity.scaleInPlace(Math.pow(this.friction, deltaTime * 60)); // Scale by delta time
            
            // Limit speed
            const currentSpeed = this.velocity.length();
            if (currentSpeed > this.maxSpeed) {
                this.velocity.normalize().scaleInPlace(this.maxSpeed);
            }
            
            // Apply velocity to position
            this.ship.position.addInPlace(this.velocity.scale(deltaTime * 60));
            
            // Keep ship at water level
            this.ship.position.y = 0;
            
            // Update forward vector based on ship's rotation
            this.forward = BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, 0, 1),
                BABYLON.Matrix.RotationY(this.ship.rotation.y)
            ).normalize();
            
        } catch (error) {
            console.error('Error in ship controls update:', error);
        }
    }
}
