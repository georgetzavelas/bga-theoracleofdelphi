/**
 * Animation Manager - Animation Helpers
 * Provides reusable animation utilities for game components
 */

var AnimationManager = {
    game: null,

    /**
     * Initialize animation manager
     */
    setup: function(game) {
        this.game = game;
    },

    /**
     * Slide element to position
     */
    slideToPosition: async function(elementId, targetX, targetY, duration = 500) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const currentRect = element.getBoundingClientRect();
        const deltaX = targetX - currentRect.left;
        const deltaY = targetY - currentRect.top;

        element.style.transition = `transform ${duration}ms ease-in-out`;
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        await this.wait(duration);

        element.style.transform = '';
        element.style.transition = '';
    },

    /**
     * Fade in element
     */
    fadeIn: async function(elementId, duration = 300) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms`;

        // Force reflow
        element.offsetHeight;

        element.style.opacity = '1';

        await this.wait(duration);

        element.style.transition = '';
    },

    /**
     * Fade out element
     */
    fadeOut: async function(elementId, duration = 300) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.style.transition = `opacity ${duration}ms`;
        element.style.opacity = '0';

        await this.wait(duration);

        element.style.transition = '';
    },

    /**
     * Scale pulse animation
     */
    pulse: async function(elementId, scale = 1.1, duration = 300) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.style.transition = `transform ${duration}ms ease-in-out`;
        element.style.transform = `scale(${scale})`;

        await this.wait(duration);

        element.style.transform = 'scale(1)';

        await this.wait(duration);

        element.style.transition = '';
    },

    /**
     * Shake animation (for errors/invalid moves)
     */
    shake: async function(elementId, intensity = 10, duration = 400) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const keyframes = [
            { transform: 'translateX(0)' },
            { transform: `translateX(-${intensity}px)` },
            { transform: `translateX(${intensity}px)` },
            { transform: `translateX(-${intensity}px)` },
            { transform: `translateX(${intensity}px)` },
            { transform: 'translateX(0)' }
        ];

        const options = {
            duration: duration,
            iterations: 1
        };

        element.animate(keyframes, options);

        await this.wait(duration);
    },

    /**
     * Flip card animation
     */
    flipCard: async function(elementId, duration = 600) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.style.transition = `transform ${duration / 2}ms`;
        element.style.transform = 'rotateY(90deg)';

        await this.wait(duration / 2);

        // Change card face (caller should update content)
        element.style.transform = 'rotateY(0deg)';

        await this.wait(duration / 2);

        element.style.transition = '';
    },

    /**
     * Bounce in animation
     */
    bounceIn: async function(elementId, duration = 600) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const keyframes = [
            { transform: 'scale(0)', opacity: 0 },
            { transform: 'scale(1.1)', opacity: 1 },
            { transform: 'scale(0.9)' },
            { transform: 'scale(1)' }
        ];

        const options = {
            duration: duration,
            iterations: 1,
            easing: 'ease-out'
        };

        element.animate(keyframes, options);

        await this.wait(duration);
    },

    /**
     * Float animation (continuous)
     */
    startFloating: function(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.add('floating');
    },

    /**
     * Stop floating animation
     */
    stopFloating: function(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.remove('floating');
    },

    /**
     * Draw attention animation
     */
    drawAttention: async function(elementId, duration = 1000) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.add('attention');

        await this.wait(duration);

        element.classList.remove('attention');
    },

    /**
     * Move along path animation
     */
    moveAlongPath: async function(elementId, path, duration = 1000) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const steps = path.length;
        const stepDuration = duration / steps;

        for (const point of path) {
            await this.slideToPosition(elementId, point.x, point.y, stepDuration);
        }
    },

    /**
     * Highlight element temporarily
     */
    highlightTemporary: async function(elementId, duration = 1000) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.add('highlighted');

        await this.wait(duration);

        element.classList.remove('highlighted');
    },

    /**
     * Count up number animation
     */
    countUp: async function(elementId, from, to, duration = 1000) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const steps = 30;
        const increment = (to - from) / steps;
        const stepDuration = duration / steps;

        let current = from;

        for (let i = 0; i < steps; i++) {
            current += increment;
            element.textContent = Math.round(current);
            await this.wait(stepDuration);
        }

        element.textContent = to;
    },

    /**
     * Wait utility (Promise-based)
     */
    wait: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Chain multiple animations
     */
    sequence: async function(...animations) {
        for (const animation of animations) {
            await animation();
        }
    },

    /**
     * Run animations in parallel
     */
    parallel: async function(...animations) {
        await Promise.all(animations.map(anim => anim()));
    }
};