import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  phase: number;
}

interface FloatingLabel {
  x: number;
  y: number;
  vy: number;
  opacity: number;
  text: string;
  fadeIn: boolean;
  life: number;
  maxLife: number;
}

interface Particle {
  x: number;
  y: number;
  vy: number;
  opacity: number;
  radius: number;
}

const LABELS = ["إيرادات", "مصاريف", "أرباح", "ميزانية", "تدفق نقدي", "أصول", "خصوم", "ضرائب"];

const FinancialCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      w = rect?.width || window.innerWidth;
      h = rect?.height || window.innerHeight;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Nodes
    const nodes: Node[] = Array.from({ length: 25 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      radius: Math.random() * 2.5 + 1.5,
      opacity: Math.random() * 0.4 + 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    // Labels
    const labels: FloatingLabel[] = Array.from({ length: 6 }, () => createLabel(w, h));

    // Particles
    const particles: Particle[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vy: -Math.random() * 0.3 - 0.1,
      opacity: Math.random() * 0.3 + 0.05,
      radius: Math.random() * 1 + 0.5,
    }));

    // Chart curves
    let gridOffset = 0;
    let chartPhase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Layer 2: Perspective grid
      gridOffset = (gridOffset + 0.15) % 40;
      ctx.strokeStyle = "rgba(232, 160, 32, 0.08)";
      ctx.lineWidth = 0.5;
      const gridSpacing = 40;
      for (let i = -gridSpacing; i < w + gridSpacing; i += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(i + gridOffset, 0);
        ctx.lineTo(i + gridOffset - 60, h);
        ctx.stroke();
      }
      for (let j = 0; j < h; j += gridSpacing) {
        const yy = (j + gridOffset) % h;
        const scale = 0.5 + (yy / h) * 0.5;
        ctx.globalAlpha = scale * 0.15;
        ctx.strokeStyle = "rgba(232, 160, 32, 1)";
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(w, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Layer 3: Node connections
      const connectionDist = 120;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.2;
            ctx.strokeStyle = `rgba(232, 160, 32, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Layer 3: Nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.phase += 0.02;
        const pulse = 0.7 + Math.sin(n.phase) * 0.3;

        if (n.y < -10) { n.y = h + 10; n.x = Math.random() * w; }
        if (n.x < -10) n.x = w + 10;
        if (n.x > w + 10) n.x = -10;

        // Glow
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 4);
        grad.addColorStop(0, `rgba(232, 160, 32, ${n.opacity * pulse})`);
        grad.addColorStop(1, "rgba(232, 160, 32, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(232, 160, 32, ${n.opacity * pulse})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Layer 4: Chart lines
      chartPhase += 0.005;
      for (let c = 0; c < 3; c++) {
        ctx.strokeStyle = `rgba(232, 160, 32, ${0.15 + c * 0.05})`;
        ctx.lineWidth = 1.5 - c * 0.3;
        ctx.beginPath();
        const baseY = h * (0.5 + c * 0.12);
        for (let x = 0; x <= w; x += 3) {
          const progress = x / w;
          const y = baseY - Math.sin(progress * Math.PI * 2 + chartPhase + c) * 30
            - Math.sin(progress * Math.PI * 4 + chartPhase * 1.5 + c) * 15
            - progress * 40;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Layer 5: Floating labels
      ctx.font = "12px 'Tajawal', sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < labels.length; i++) {
        const l = labels[i];
        l.y += l.vy;
        l.life++;

        if (l.life < l.maxLife * 0.15) {
          l.opacity = l.life / (l.maxLife * 0.15);
        } else if (l.life > l.maxLife * 0.7) {
          l.opacity = 1 - (l.life - l.maxLife * 0.7) / (l.maxLife * 0.3);
        } else {
          l.opacity = 1;
        }

        if (l.life >= l.maxLife) {
          labels[i] = createLabel(w, h);
          continue;
        }

        ctx.fillStyle = `rgba(232, 160, 32, ${l.opacity * 0.45})`;
        ctx.fillText(l.text, l.x, l.y);
      }

      // Layer 6: Dust particles
      for (const p of particles) {
        p.y += p.vy;
        if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[1]"
    />
  );
};

function createLabel(w: number, h: number): FloatingLabel {
  return {
    x: Math.random() * w * 0.7 + w * 0.15,
    y: h * 0.6 + Math.random() * h * 0.3,
    vy: -Math.random() * 0.3 - 0.15,
    opacity: 0,
    text: LABELS[Math.floor(Math.random() * LABELS.length)],
    fadeIn: true,
    life: 0,
    maxLife: 300 + Math.random() * 200,
  };
}

export default FinancialCanvas;
