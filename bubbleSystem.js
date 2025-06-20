export class BubbleSystem {
    constructor(scene, ship, options = {}) {
        this.scene = scene;
        this.ship = ship;
        
        // Initialize bubble arrays
        this.leftBubbles = [];
        this.rightBubbles = [];
        this.particles = []; // Keep for backward compatibility
        this.spherePool = [];
        this.timeSinceLastEmit = 0;
        
        // Default options
        this.options = {
            emitRate: 30,           // Bubbles per second (per side)
            maxBubbles: 50,         // Maximum number of bubbles (per side)
            minSize: 0.15,          // Minimum bubble size
            maxSize: 0.6,           // Maximum bubble size
            sizeVariation: 0.3,     // How much size can vary from base size (0-1)
            minLifetime: 0.8,       // Minimum lifetime in seconds
            maxLifetime: 2.0,       // Maximum lifetime in seconds
            minSpeed: 0.3,          // Minimum speed
            maxSpeed: 1.2,          // Maximum speed
            sideOffset: 1.5,        // How far to the side of the ship
            verticalOffset: -0.8,   // How far below the ship
            offsetZ: -2.5,          // How far behind the ship to spawn bubbles
            color1: new BABYLON.Color4(0.8, 0.9, 1.0, 0.7),  // Light blue
            color2: new BABYLON.Color4(0.95, 0.98, 1.0, 0.4), // Almost white
            ...options
        };
        
        // Ensure size variation is within valid range
        this.options.sizeVariation = Math.max(0, Math.min(1, this.options.sizeVariation || 0.3));
        
        // Initialize bubble arrays
        this.leftBubbles = [];
        this.rightBubbles = [];
        this.spherePool = [];
        
        // Create particle material
        this.material = new BABYLON.StandardMaterial("bubbleMat", scene);
        this.material.diffuseColor = new BABYLON.Color3(0.8, 0.9, 1.0);
        this.material.specularColor = new BABYLON.Color3(1, 1, 1);
        this.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.6);
        this.material.alpha = 0.8;
        this.material.alphaMode = BABYLON.Engine.ALPHA_ADD;
        this.material.backFaceCulling = false;
        
        // Create a pool of sphere meshes for better performance
        this.spherePool = [];
        const poolSize = this.options.maxBubbles;
        for (let i = 0; i < poolSize; i++) {
            const sphere = BABYLON.MeshBuilder.CreateSphere(`bubble_${i}`, {
                diameter: 1,
                segments: 4  // Low poly for better performance
            }, scene);
            sphere.isVisible = false;
            sphere.material = this.material;
            this.spherePool.push(sphere);
        }
    }
    
    update(deltaTime) {
        if (!this.ship) return;
        
        // Get ship speed from physics if available, otherwise use 0
        let shipSpeed = 0;
        if (this.ship._collider && this.ship._collider.physicsImpostor) {
            const velocity = this.ship._collider.physicsImpostor.getLinearVelocity();
            if (velocity) {
                shipSpeed = velocity.length();
            }
        } else if (this.ship.getSpeed) {
            // Fallback to getSpeed method if it exists
            shipSpeed = this.ship.getSpeed();
        }
        
        // Store speed for use in emitBubble
        this.currentSpeed = shipSpeed;
        
        const shouldEmit = shipSpeed > 0.1; // Only emit when moving
        
        // Emit new bubbles - scale emission rate with speed (capped at 2x base rate)
        if (shouldEmit) {
            // Calculate speed factor (1.0 at base speed, up to 2.0 at higher speeds)
            const speedFactor = 1.0 + Math.min(1.0, shipSpeed / 10); // Cap at 2x emission rate
            const effectiveEmitRate = this.options.emitRate * speedFactor;
            
            this.timeSinceLastEmit += deltaTime;
            const emitInterval = 1 / effectiveEmitRate;
            
            while (this.timeSinceLastEmit >= emitInterval) {
                this.emitBubble();
                this.timeSinceLastEmit -= emitInterval;
            }
        } else {
            this.timeSinceLastEmit = 0;
        }
        
        // Update existing bubbles (both left and right)
        this.updateBubbleArray(this.leftBubbles, deltaTime);
        this.updateBubbleArray(this.rightBubbles, deltaTime);
    }
    
    updateBubbleArray(bubbles, deltaTime) {
        if (!bubbles || bubbles.length === 0) return;
        
        // Cap deltaTime to prevent large jumps when tab is inactive
        const cappedDeltaTime = Math.min(deltaTime, 0.1);
        
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const particle = bubbles[i];
            if (!particle) {
                bubbles.splice(i, 1);
                continue;
            }
            
            try {
                // Update lifetime
                particle.lifetime = (particle.lifetime || 0) - cappedDeltaTime;
                
                // Check if bubble should be removed
                if (particle.lifetime <= 0 || !particle.sphere) {
                    if (particle.sphere) {
                        particle.sphere.isVisible = false;
                        this.spherePool.push(particle.sphere);
                        particle.sphere = null;
                    }
                    bubbles.splice(i, 1);
                    continue;
                }
                
                // Skip if we don't have a valid sphere or position data
                if (!particle.sphere || !particle.position || !particle.velocity) {
                    if (particle.sphere) {
                        particle.sphere.isVisible = false;
                        this.spherePool.push(particle.sphere);
                        particle.sphere = null;
                    }
                    bubbles.splice(i, 1);
                    continue;
                }

                // Update position with velocity
                particle.position.addInPlace(particle.velocity.scale(cappedDeltaTime));
                
                // Apply gentle drift from ship movement if available
                if (this.ship._shipControls && this.ship._shipControls.velocity) {
                    const drift = this.ship._shipControls.velocity.scale(0.2 * cappedDeltaTime);
                    particle.position.addInPlace(drift);
                }
                
                // Update sphere position
                particle.sphere.position.copyFrom(particle.position);
                
                // Calculate lifetime ratio (1 at start, 0 at end)
                const lifeRatio = Math.max(0, Math.min(1, particle.lifetime / (particle.maxLifetime || 1)));
                
                // Scale based on lifetime with some variation
                const baseScale = 0.7 + lifeRatio * 0.3; // Slightly larger at birth
                const randomScale = 0.9 + Math.random() * 0.2;
                const scale = (particle.size || 1) * baseScale * randomScale;
                
                // Apply scale if valid
                if (scale > 0.01 && isFinite(scale)) {
                    particle.sphere.scaling.set(scale, scale, scale);
                }
                
                // Update alpha (fade out)
                if (particle.sphere.material) {
                    particle.sphere.material.alpha = 0.3 + 0.7 * lifeRatio;
                }
                
                // Add gentle bobbing motion
                if (particle.time === undefined) particle.time = Math.random() * 10;
                particle.time += cappedDeltaTime;
                particle.sphere.position.y += Math.sin(particle.time * 2) * 0.003;
                
            } catch (e) {
                console.warn('Error updating bubble:', e);
                // Remove problematic bubble
                if (particle && particle.sphere) {
                    particle.sphere.isVisible = false;
                    this.spherePool.push(particle.sphere);
                    particle.sphere = null;
                }
                bubbles.splice(i, 1);
            }
        }
    }
    
    emitBubble() {
        if (this.leftBubbles.length >= this.options.maxBubbles || this.rightBubbles.length >= this.options.maxBubbles || this.spherePool.length < 2) {
            return;
        }
        
        // Calculate speed factor for size scaling (1.0 at base speed, up to 2.0 at higher speeds)
        const speedFactor = 1.0 + Math.min(1.0, (this.currentSpeed || 0) / 10);
        
        // Get ship direction
        const shipForward = this.ship.forward.scale(-1); // Invert because ship points backward
        const shipRight = this.ship.right;
        
        // Calculate spawn position behind the ship
        const spawnPosLeft = this.ship.position.add(
            shipForward.scale(this.options.offsetZ || -2) // Use offsetZ or default to -2
            .add(shipRight.scale(-this.options.sideOffset))
            .add(new BABYLON.Vector3(0, this.options.verticalOffset, 0))
        );
        const spawnPosRight = this.ship.position.add(
            shipForward.scale(this.options.offsetZ || -2) // Use offsetZ or default to -2
            .add(shipRight.scale(this.options.sideOffset))
            .add(new BABYLON.Vector3(0, this.options.verticalOffset, 0))
        );
        
        // Random direction (mostly up with some spread)
        const directionLeft = new BABYLON.Vector3(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 0.5 + 0.5,
            (Math.random() - 0.5) * 0.5
        ).normalize();
        const directionRight = new BABYLON.Vector3(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 0.5 + 0.5,
            (Math.random() - 0.5) * 0.5
        ).normalize();
        
        const speed = this.options.minSpeed + Math.random() * (this.options.maxSpeed - this.options.minSpeed);
        const velocityLeft = directionLeft.scale(speed);
        const velocityRight = directionRight.scale(speed);
        
        // Create new particles with varied sizes
        const lifetime = this.options.minLifetime + Math.random() * (this.options.maxLifetime - this.options.minLifetime);
        
        // Base size with some random variation, scaled by ship speed
        const speedSizeFactor = 0.8 + (this.currentSpeed || 0) * 0.1; // 0.8x to 1.8x size based on speed
        const baseSize = (this.options.minSize + Math.random() * (this.options.maxSize - this.options.minSize)) * speedSizeFactor;
        
        // Apply additional size variation to each bubble independently
        const sizeLeft = Math.max(0.05, baseSize * (1 + (Math.random() * 2 - 1) * this.options.sizeVariation));
        const sizeRight = Math.max(0.05, baseSize * (1 + (Math.random() * 2 - 1) * this.options.sizeVariation));
        
        // Get spheres from pool and set their sizes
        const sphereLeft = this.spherePool.pop();
        if (sphereLeft) {
            sphereLeft.position.copyFrom(spawnPosLeft);
            sphereLeft.scaling.setAll(sizeLeft);
            sphereLeft.isVisible = true;
            
            // Set material properties
            const colorRatio = Math.random();
            const color = BABYLON.Color4.Lerp(this.options.color1, this.options.color2, colorRatio);
            sphereLeft.material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
            sphereLeft.material.alpha = color.a * (0.7 + Math.random() * 0.3);
            
            this.leftBubbles.push({
                position: spawnPosLeft.clone(),
                velocity: velocityLeft,
                size: sizeLeft,
                lifetime: lifetime,
                maxLifetime: lifetime,
                time: Math.random() * 100,
                sphere: sphereLeft
            });
        }
        
        const sphereRight = this.spherePool.pop();
        if (sphereRight) {
            sphereRight.position.copyFrom(spawnPosRight);
            sphereRight.scaling.setAll(sizeRight);
            sphereRight.isVisible = true;
            
            // Set material properties
            const colorRatio = Math.random();
            const color = BABYLON.Color4.Lerp(this.options.color1, this.options.color2, colorRatio);
            sphereRight.material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
            sphereRight.material.alpha = color.a * (0.7 + Math.random() * 0.3);
            
            this.rightBubbles.push({
                position: spawnPosRight.clone(),
                velocity: velocityRight,
                size: sizeRight,
                lifetime: lifetime,
                maxLifetime: lifetime,
                time: Math.random() * 100,
                sphere: sphereRight
            });
        }
    }
    
    dispose() {
        // Clean up all particles and pool
        this.leftBubbles.forEach(particle => {
            particle.sphere.dispose();
        });
        this.rightBubbles.forEach(particle => {
            particle.sphere.dispose();
        });
        
        this.spherePool.forEach(sphere => {
            sphere.dispose();
        });
        
        this.material.dispose();
        this.particles = [];
        this.spherePool = [];
    }
}
