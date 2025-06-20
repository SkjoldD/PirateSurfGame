export class ShipControls {
    constructor(scene, shipMesh, options = {}) {
        this.scene = scene;
        this.ship = shipMesh;
        this.collider = shipMesh._collider;
        
        // Control state
        this.enabled = options.enabled !== false; // Enabled by default unless specified
        
        // Movement settings
        this.acceleration =  0.5;     // How quickly the ship speeds up
        this.deceleration =  0.98;   // How quickly the ship slows down (higher = slower deceleration)
        this.maxSpeed = 10.0;            // Maximum speed
        this.speed = 0.8;                  // Base movement speed
        
        // Rotation settings
        this.rotationAcceleration = 0.1;  // How quickly rotation speeds up
        this.rotationDeceleration = 0.95; // How quickly rotation slows down
        this.maxRotationSpeed = 2.0;          // Maximum rotation speed (radians/second)
        this.baseRotationSpeed = 1.0;        // Base rotation speed multiplier
        this.rotationSpeed = 0.06;                // Base rotation speed
        
        // Current state
        this.velocity = new BABYLON.Vector3();  // Current velocity
        this.currentSpeed = 0;     // Current speed in the forward direction
        this.targetSpeed = 0;      // Speed we're trying to reach
        this.angularVelocity = 0;   // Current rotation speed
        
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
    }
    
    attachControls() {
        const onKeyDown = (evt) => {
            const key = evt.key.toLowerCase();
            if (key in this.keys) {
                this.keys[key] = true;
            } else if (key === 'shift') {
                this.keys.shift = true;
            }
            // Handle rotation
            if (this.keys.a) {
                this.angularVelocity += this.rotationSpeed * 0.8; // Slightly slower rotation
            }
            if (this.keys.d) {
                this.angularVelocity -= this.rotationSpeed * 0.8; // Slightly slower rotation
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
        
        // Cleanup
        this.scene.onDispose = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }
    
    update() {
        if (!this.enabled || !this.ship || !this.scene) return;
        
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
        
        // Handle rotation input
        let targetRotationSpeed = 0;
        if (this.keys.a) {
            targetRotationSpeed = -this.maxRotationSpeed;
        } else if (this.keys.d) {
            targetRotationSpeed = this.maxRotationSpeed;
        }
        
        // Apply rotation acceleration/deceleration
        if (Math.abs(targetRotationSpeed) > 0.01) {
            // Accelerate towards target rotation speed
            this.currentRotationSpeed = BABYLON.Scalar.Lerp(
                this.currentRotationSpeed || 0,
                targetRotationSpeed * this.baseRotationSpeed,
                this.rotationAcceleration * deltaTime * 60
            );
        } else {
            // Apply rotation deceleration when no input
            this.currentRotationSpeed *= this.rotationDeceleration;
            if (Math.abs(this.currentRotationSpeed) < 0.001) this.currentRotationSpeed = 0;
        }
        
        // Apply rotation if we have some rotation speed
        if (Math.abs(this.currentRotationSpeed) > 0.001) {
            // Scale rotation speed by current movement speed (tighter turns at lower speeds)
            const speedFactor = 0.5 + (0.5 * Math.min(Math.abs(this.currentSpeed) / this.maxSpeed, 1.0));
            const rotationAmount = this.currentRotationSpeed * speedFactor * deltaTime;
            
            // Apply rotation
            this.ship.rotation.y += rotationAmount;
            
            // Update ship's quaternion if it exists
            if (this.ship.rotationQuaternion) {
                this.ship.rotationQuaternion.copyFrom(
                    BABYLON.Quaternion.RotationYawPitchRoll(
                        this.ship.rotation.y,
                        this.ship.rotation.x,
                        this.ship.rotation.z
                    )
                );
            }
        }
        
        // Calculate movement direction based on ship's rotation
        const rotation = this.ship.rotation.y;
        const moveX = Math.sin(rotation);
        const moveZ = Math.cos(rotation);
        
        // Update target speed based on input
        if (this.keys.w) {
            if (!(this.targetSpeed >= this.maxSpeed)){
                this.targetSpeed += this.speed;
            }
        } else if (this.keys.s) {
            if (!(this.targetSpeed <= -(this.maxSpeed/2))){
                this.targetSpeed -= this.speed * 0.5; // Slower in reverse
            }   
        } else {
            if (this.targetSpeed > 0){
                this.targetSpeed -= this.targetSpeed * 0.01;
            }
            else if (this.targetSpeed < 0){
                this.targetSpeed += this.targetSpeed * 0.01;
            }
        }
        
        // Apply acceleration/deceleration
        if (Math.abs(this.targetSpeed) > 0.01) {
            // Accelerate towards target speed
            this.currentSpeed = BABYLON.Scalar.Lerp(
                this.currentSpeed,
                this.targetSpeed,
                this.acceleration * deltaTime * 30 // Reduced acceleration for smoother movement
            );
        } else {
            // Apply deceleration when no input
            this.currentSpeed = BABYLON.Scalar.Lerp(
                this.currentSpeed,
                0,
                1 - Math.pow(this.deceleration, deltaTime * 60) // Frame-rate independent deceleration
            );
            if (Math.abs(this.currentSpeed) < 0.01) this.currentSpeed = 0;
        }
        
        // Only apply movement if we have some speed
        if (Math.abs(this.currentSpeed) > 0.01) {
            // Calculate forward vector based on ship's rotation
            const forward = new BABYLON.Vector3(0, 0, 1);
            const rotationMatrix = BABYLON.Matrix.RotationY(this.ship.rotation.y);
            const forwardDirection = BABYLON.Vector3.TransformNormal(forward, rotationMatrix);
            
            // Apply movement with current speed
            const movement = forwardDirection.scale(this.currentSpeed * deltaTime);
            this.ship.position.addInPlace(movement);
            
            // Update velocity for physics
            this.velocity.copyFrom(movement).scale(1/deltaTime);
            
            // Add some water resistance
            this.velocity.scaleInPlace(0.98);
        }
        
        // Update collider position to match ship
        if (this.collider) {
            this.collider.position.copyFrom(this.ship.position);
            this.collider.rotation.y = this.ship.rotation.y;
            
            // Update collider's quaternion if it exists
            if (this.collider.rotationQuaternion) {
                this.collider.rotationQuaternion.copyFrom(
                    BABYLON.Quaternion.RotationYawPitchRoll(
                        this.ship.rotation.y,
                        this.ship.rotation.x,
                        this.ship.rotation.z
                    )
                );
            }
            
            // Keep at water level
            if (this.collider.position.y < 0) {
                this.collider.position.y = 0;
                this.ship.position.y = 0;
            }
            
            // Update physics body if it exists
            if (this.collider.physicsImpostor) {
                this.collider.physicsImpostor.setLinearVelocity(this.velocity);
                this.collider.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(0, this.angularVelocity, 0));
            }
        }

        // Update collider if it exists
        if (this.shipMesh) {
            this.shipMesh.position.copyFrom(this.ship.position);
            this.shipMesh.rotation.y = this.ship.rotation.y;
            
            // Keep at water level
            if (this.shipMesh.position.y < 0) {
                this.shipMesh.position.y = 0;
            }
        }
    }
}
