interface Particle {
  animationDuration: number;
  speed: { x: number; y: number };
  radius: number;
  life: number;
  remainingLife: number;
  rgbArray: Uint8ClampedArray | number[];
  startX: number;
  startY: number;
  startTime: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

function createExplodingParticle(): Particle {
  const particle: Particle = {
    animationDuration: 5000,
    speed: {
      x: -5 + Math.random() * 10,
      y: -5 + Math.random() * 10,
    },
    radius: 5 + Math.random() * 5,
    life: 30 + Math.random() * 10,
    remainingLife: 30 + Math.random() * 10,
    rgbArray: [0, 0, 0, 0],
    startX: 0,
    startY: 0,
    startTime: 0,
    draw(ctx: CanvasRenderingContext2D) {
      if (this.remainingLife > 0 && this.radius > 0) {
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.rgbArray[0]},${this.rgbArray[1]},${this.rgbArray[2]},1)`;
        ctx.fill();

        this.remainingLife--;
        this.radius -= 0.25;
        this.startX += this.speed.x;
        this.startY += this.speed.y;
      }
    },
  };
  particle.remainingLife = particle.life;
  return particle;
}

let particles: Particle[] = [];

function createParticleAtPoint(
  x: number,
  y: number,
  colorData: Uint8ClampedArray | number[]
) {
  const particle = createExplodingParticle();
  particle.rgbArray = colorData;
  particle.startX = x;
  particle.startY = y;
  particle.startTime = Date.now();
  particles.push(particle);
}

let particleCtx: CanvasRenderingContext2D | undefined;

function createParticleCanvas() {
  const particleCanvas = document.createElement("canvas");
  const ctx = particleCanvas.getContext("2d");
  if (!ctx) return;
  particleCtx = ctx;

  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  particleCanvas.style.position = "absolute";
  particleCanvas.style.top = "0";
  particleCanvas.style.left = "0";
  particleCanvas.style.zIndex = "1001";
  particleCanvas.style.pointerEvents = "none";

  document.body.appendChild(particleCanvas);
}

function update() {
  if (particleCtx) {
    particleCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  for (let i = 0; i < particles.length; i++) {
    particles[i]!.draw(particleCtx!);

    if (i === particles.length - 1) {
      const percent =
        (Date.now() - particles[i]!.startTime) /
        particles[i]!.animationDuration;

      if (percent > 1) {
        particles = [];
      }
    }
  }

  window.requestAnimationFrame(update);
}
window.requestAnimationFrame(update);

function extractBgUrl(el: HTMLElement): string | null {
  const bg = getComputedStyle(el).backgroundImage;
  const match = bg.match(/url\(["']?(.+?)["']?\)/);
  return match?.[1] ?? null;
}

function loadImageOffscreen(
  url: string,
  w: number,
  h: number
): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function emitParticlesFor(disc: HTMLElement): Promise<void> {
  if (!disc.isConnected) return;
  const bcr = disc.getBoundingClientRect();
  const width = Math.round(bcr.width);
  const height = Math.round(bcr.height);
  if (width === 0 || height === 0) return;

  const url = extractBgUrl(disc);
  if (!url) return;

  const canvas = await loadImageOffscreen(url, width, height);
  if (!canvas || !disc.isConnected) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  let colorData: Uint8ClampedArray;
  try {
    colorData = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return;
  }

  createParticleCanvas();

  const reductionFactor = 17;
  const liveBcr = disc.getBoundingClientRect();

  let count = 0;
  for (let localX = 0; localX < width; localX++) {
    for (let localY = 0; localY < height; localY++) {
      if (count % reductionFactor === 0) {
        const index = (localY * width + localX) * 4;
        const rgbaColorArr = colorData.slice(index, index + 4);
        const globalX = liveBcr.left + localX;
        const globalY = liveBcr.top + localY;
        createParticleAtPoint(globalX, globalY, rgbaColorArr);
      }
      count++;
    }
  }
}

export default function PlayAffect(btn: HTMLElement) {
  // Find disc buttons inside (single winner: 1 button; tie: 2 buttons)
  const discs = Array.from(btn.querySelectorAll<HTMLElement>("button"));
  if (discs.length === 0) discs.push(btn);
  for (const disc of discs) {
    void emitParticlesFor(disc);
  }
}
