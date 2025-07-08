export class ShipControls {
    constructor(scene, shipMesh, options = {}) {
        this.scene = scene;
        this.ship = shipMesh;
        this.collider = shipMesh._collider;
        this.jumpPower = 100;

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
        
        // Jump state
        this.jumpEnabled = false;   // Whether jumping is enabled
        this.isJumping = false;     // Whether the ship is currently jumping
        this.jumpForce = 0;         // Current jump force being applied
        this.gravity = -9.81;       // Gravity value for jump physics
        this.groundY = 0;           // Y-coordinate of the ground level
        this.jumpPower = 150;        // Initial jump power
        
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
            } else if (key === ' ' || key === 'spacebar') {
                this.keys.space = true;
                this.handleJump();
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
            } else if (key === ' ' || key === 'spacebar') {
                this.keys.space = false;
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
    
    // Helper method to check if the ship is on any surface using raycasting
    isOnSurface() {
        if (!this.collider) {
            console.log('No collider found');
            return false;
        }
        
        const position = this.collider.getAbsolutePosition();
        
        // Method 1: Check if we're at or below ground level (y=0)
        if (position.y <= 0.2) {  // Slightly above 0 to account for floating point precision
            console.log('On ground/water surface');
            return true;
        }
        
        // Method 2: Raycast to check for surfaces below
        const rayLength = 1.0; // Increased ray length
        const rayOrigin = position.add(new BABYLON.Vector3(0, 0.1, 0));
        const rayDirection = new BABYLON.Vector3(0, -1, 0);
        
        // Create a ray and check for intersections
        const ray = new BABYLON.Ray(rayOrigin, rayDirection, rayLength);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            // Check for ground/water or any other surface with physics
            return mesh !== this.collider && (mesh.physicsImpostor || mesh.name === 'ground' || mesh.name === 'waterSurface');
        });
        
        const isOnSurface = hit.hit || position.y <= 0.2;
        console.log('Surface check:', {
            positionY: position.y,
            rayHit: hit.hit,
            hitMesh: hit.hit ? hit.pickedMesh.name : 'none',
            isOnSurface: isOnSurface
        });
        
        return isOnSurface;
    }
    
    handleJump() {
        // Check if jump is enabled and we're not already jumping
        const onSurface = this.isOnSurface();
        if (!this.jumpEnabled || this.isJumping || !onSurface) {
            console.log("Cannot jump: ", {
                jumpEnabled: this.jumpEnabled,
                isJumping: this.isJumping,
                onSurface: onSurface
            });
            return;
        }
        
        console.log("JUMPING with power: " + this.jumpPower);
        
        // Start jump
        this.isJumping = true;
        this.jumpForce = this.jumpPower;
        this.jumpStartTime = Date.now();
        this.jumpForceActive = true;
        this.jumpForceDuration = 0.5;
        
        // Store initial position for height calculations
        this.jumpStartY = this.ship.position.y;
        this.maxHeightReached = this.jumpStartY;
        
        // Reset any existing velocity and wake up the physics body
        if (this.collider && this.collider.physicsImpostor) {
            const physics = this.collider.physicsImpostor;
            physics.wakeUp();
            
            // Reset velocities
            physics.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
            physics.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
            
            // Apply an initial impulse to get things moving
            const initialImpulse = new BABYLON.Vector3(0, this.jumpForce * 0.1, 0);
            physics.applyImpulse(
                initialImpulse,
                this.collider.getAbsolutePosition()
            );
            
            console.log('Applied initial impulse:', initialImpulse);
        }
        
        console.log(`Starting jump from y=${this.jumpStartY.toFixed(2)}`);
        
        // Play jump sound if available
        if (window.audioManager) {
            window.audioManager.playSound('jump');
        }
    }
    
    updateJump(deltaTime) {
        if (!this.isJumping || !this.collider || !this.collider.physicsImpostor) return;
        
        const physics = this.collider.physicsImpostor;
        const velocity = physics.getLinearVelocity();
        const position = this.ship.position;
        const currentTime = Date.now();
        const timeSinceJump = (currentTime - this.jumpStartTime) / 1000; // in seconds
        
        // Track maximum height reached
        const heightAboveStart = position.y - this.jumpStartY;
        this.maxHeightReached = Math.max(this.maxHeightReached, position.y);
        
        // Apply continuous upward force during the initial part of the jump
        if (this.jumpForceActive) {
            const jumpProgress = timeSinceJump / this.jumpForceDuration;
            
            if (jumpProgress < 1.0) {
                // Wake up the physics body in case it fell asleep
                physics.wakeUp();
                
                // Calculate force magnitude (starts strong, decreases over time)
                const forceMagnitude = this.jumpForce * (1 - jumpProgress);
                
                // Apply force in world space at the collider's position
                const jumpForce = new BABYLON.Vector3(0, forceMagnitude, 0);
                physics.applyForce(
                    jumpForce,
                    this.collider.getAbsolutePosition()
                );
                
                // Debug visualization
                if (this.debugForce) this.debugForce.dispose();
                this.debugForce = BABYLON.MeshBuilder.CreateLines("jumpForce", {
                    points: [
                        this.collider.position,
                        this.collider.position.add(new BABYLON.Vector3(0, forceMagnitude * 0.001, 0))
                    ]
                }, this.scene);
                this.debugForce.color = new BABYLON.Color3(1, 0, 0);
                
                console.log(`Applying jump force: ${forceMagnitude.toFixed(2)} ` +
                          `at t=${timeSinceJump.toFixed(2)}s ` +
                          `from y=${position.y.toFixed(2)} ` +
                          `with velocity y=${velocity.y.toFixed(2)}`);
            } else {
                // End the force application phase
                this.jumpForceActive = false;
                console.log(`Ended jump force application at t=${timeSinceJump.toFixed(2)}s`);
                if (this.debugForce) {
                    this.debugForce.dispose();
                    this.debugForce = null;
                }
            }
        }
        
        // Check for landing on any surface using raycasting
        const isMovingDownward = velocity.y <= 0.1;
        const isOnSurface = this.isOnSurface();
        
        if (isMovingDownward && isOnSurface) {
            // Calculate actual height achieved
            const actualHeight = this.maxHeightReached - this.jumpStartY;
            
            // Snap to ground and reset jump state
            position.y = this.groundY;
            this.isJumping = false;
            this.jumpForceActive = false;
            this.jumpForce = 0;
            
            // Reset velocities
            physics.setLinearVelocity(new BABYLON.Vector3(velocity.x, 0, velocity.z));
            physics.setAngularVelocity(BABYLON.Vector3.Zero());
            
            // Clean up debug visualization
            if (this.debugForce) {
                this.debugForce.dispose();
                this.debugForce = null;
            }
            
            // Play landing sound if available
            if (window.audioManager) {
                window.audioManager.playSound('land');
            }
            
            console.log(`Landed after ${timeSinceJump.toFixed(2)}s, ` +
                       `height: ${actualHeight.toFixed(2)} units`);
        }
        
        // Log debug info every frame for now
        console.log(`Jump: t=${timeSinceJump.toFixed(3)}s, ` +
                   `y=${position.y.toFixed(3)}, ` +
                   `vy=${velocity.y.toFixed(3)}, ` +
                   `forceActive=${this.jumpForceActive}, ` +
                   `height=${heightAboveStart.toFixed(3)}`);
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
                this.targetSpeed -= this.speed * 0.01;
            }
            else if (this.targetSpeed < 0){
                this.targetSpeed += this.speed * 0.01;
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
        
        // Update jump physics
        this.updateJump(deltaTime);
        
        // Update collider position to match ship (only x and z for now)
        if (this.collider) {
            // Only update x and z position, keep y position fixed
            this.collider.position.x = this.ship.position.x;
            this.collider.position.z = this.ship.position.z;
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
