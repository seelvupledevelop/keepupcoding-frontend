/**
 * Vanilla JS Cursor-Reactive Soft Gradient Canvas
 * Subtle, pleasant fluid gradient mesh with organic floating motion and mouse attraction
 */
(function() {
  const canvas = document.getElementById('gradient-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let mouse = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    if (!mouse.active) {
      mouse.x = mouse.targetX = width * 0.5;
      mouse.y = mouse.targetY = height * 0.3;
    }
  }

  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;
    mouse.active = true;
  });

  window.addEventListener('mouseleave', () => {
    mouse.active = false;
  });

  // Soft UI Gradient Orbs
  const orbs = [
    { x: 0.2, y: 0.2, r: 0.45, vx: 0.0003, vy: 0.0004, color1: 'rgba(121, 40, 202, 0.15)', color2: 'rgba(255, 0, 128, 0.05)' },
    { x: 0.8, y: 0.3, r: 0.50, vx: -0.0004, vy: 0.0003, color1: 'rgba(33, 212, 253, 0.12)', color2: 'rgba(33, 82, 255, 0.03)' },
    { x: 0.5, y: 0.8, r: 0.55, vx: 0.0002, vy: -0.0003, color1: 'rgba(255, 0, 128, 0.10)', color2: 'rgba(121, 40, 202, 0.02)' },
    { x: 0.7, y: 0.7, r: 0.40, vx: -0.0003, vy: -0.0002, color1: 'rgba(0, 114, 255, 0.10)', color2: 'rgba(0, 198, 255, 0.02)' }
  ];

  let time = 0;

  function animate() {
    time += 0.015;
    
    // Smooth mouse lerp
    mouse.x += (mouse.targetX - mouse.x) * 0.04;
    mouse.y += (mouse.targetY - mouse.y) * 0.04;

    ctx.clearRect(0, 0, width, height);

    // Is Dark Mode Active?
    const isDark = document.documentElement.classList.contains('dark');
    const opacityMultiplier = isDark ? 1.6 : 0.8;

    orbs.forEach((orb, i) => {
      // Natural organic wave drift
      const currentX = (orb.x * width) + Math.sin(time + i * 1.5) * (width * 0.08) + ((mouse.x - width * 0.5) * 0.08 * (i + 1));
      const currentY = (orb.y * height) + Math.cos(time + i * 1.2) * (height * 0.08) + ((mouse.y - height * 0.5) * 0.08 * (i + 1));
      const radius = Math.min(width, height) * orb.r;

      const gradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, radius);
      
      let c1 = orb.color1;
      let c2 = orb.color2;

      if (isDark) {
        c1 = c1.replace('0.15', '0.22').replace('0.12', '0.18').replace('0.10', '0.16');
      }

      gradient.addColorStop(0, c1);
      gradient.addColorStop(0.6, c2);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(currentX, currentY, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Cursor Follower Soft Highlight
    if (mouse.active) {
      const mouseGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, Math.min(width, height) * 0.35);
      const mouseColor = isDark ? 'rgba(121, 40, 202, 0.18)' : 'rgba(33, 82, 255, 0.10)';
      mouseGrad.addColorStop(0, mouseColor);
      mouseGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mouseGrad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, Math.min(width, height) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
})();
