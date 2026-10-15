/* Home-page motion: wordmark, aurora, tilt, reveal, count-up. Classic script, no imports. */
(function () {
  const freezeMatch = /[?&]freeze=(\d+)/.exec(location.search);
  const freezeMs: number | null = freezeMatch ? +freezeMatch[1] : null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const word = document.querySelector(".mark .w");
  if (word) {
    for (const [i, ch] of Array.from("rende").entries()) {
      const span = document.createElement("span");
      span.className = "ch";
      span.style.setProperty("--i", String(i));
      span.textContent = ch;
      word.appendChild(span);
    }
  }

  const reveals = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
  if (freezeMs !== null) {
    setTimeout(() => {
      const animations = document.getAnimations?.() ?? [];
      for (const anim of animations) {
        anim.currentTime = freezeMs;
        anim.pause();
      }
    }, 0);
  }

  const countUp = (el: HTMLElement): void => {
    if (reduced) return;
    const to = +(el.dataset.count ?? "0");
    const t0 = performance.now();
    const step = (now: number): void => {
      let k = Math.min((now - t0) / 1400, 1);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * k).toLocaleString("en-US");
      if (k < 1) requestAnimationFrame(step);
    };
    step(t0);
  };

  if (reduced || freezeMs !== null || !("IntersectionObserver" in window)) {
    for (const el of reveals) el.classList.add("in");
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          const siblings = target.parentElement?.children ?? [];
          const index = Array.prototype.indexOf.call(siblings, target);
          target.style.transitionDelay = `${Math.min(index, 4) * 80}ms`;
          target.classList.add("in");
          io.unobserve(target);
          const num = target.querySelector<HTMLElement>("[data-count]");
          if (num) countUp(num);
        }
      },
      { threshold: 0.15 },
    );
    for (const el of reveals) io.observe(el);
  }

  if (fine && !reduced) {
    for (const card of document.querySelectorAll<HTMLElement>(".tool")) {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const tilt = (0.5 - y) * 10;
        const yaw = (x - 0.5) * 12;
        card.style.transform = `rotateX(${tilt}deg) rotateY(${yaw}deg) translateZ(0) scale(1.02)`;
        card.style.setProperty("--mx", `${x * 100}%`);
        card.style.setProperty("--my", `${y * 100}%`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    }
  }

  const canvas = document.getElementById("aurora");
  if (!canvas || canvas.tagName !== "CANVAS" || !("getContext" in canvas)) return;
  const cv = canvas as HTMLCanvasElement;
  const gl = cv.getContext("webgl", {
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: freezeMs !== null,
  });
  if (!gl) return;

  const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const fs =
    "precision highp float;uniform float t;uniform vec2 r;uniform vec2 m;" +
    "vec3 P(vec3 x){return mod(((x*34.)+1.)*x,289.);}" +
    "float sn(vec2 v){const vec4 C=vec4(.211324865,.366025404,-.577350269,.024390244);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=x0.x>x0.y?vec2(1,0):vec2(0,1);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.);vec3 p=P(P(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));vec3 mm=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);mm=mm*mm;mm=mm*mm;vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 a0=x-floor(x+.5);mm*=1.79284291-.85373472*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(mm,g);}" +
    "void main(){vec2 uv=gl_FragCoord.xy/r;vec3 c1=vec3(.937,.675,.294),c2=vec3(.498,.82,.682),c3=vec3(.106,.227,.549);" +
    "vec3 col=uv.x<.5?mix(c3,c2,uv.x*2.):mix(c2,c1,(uv.x-.5)*2.);" +
    "float h=sn(vec2(uv.x*2.+t*.1+m.x*.3,t*.25))*.5*.55;h=exp(h);float y=uv.y*2.-h+.2+m.y*.15;" +
    "float a=smoothstep(.0,1.1,.55*y)*smoothstep(1.8,.55,y);a*=.75;gl_FragColor=vec4(col*a,a);}";

  const shader = (type: number, source: string): WebGLShader => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error("webgl shader");
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    return sh;
  };

  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uTime = gl.getUniformLocation(program, "t");
  const uRes = gl.getUniformLocation(program, "r");
  const uMouse = gl.getUniformLocation(program, "m");

  let mx = 0;
  let my = 0;
  let tx = 0;
  let ty = 0;
  let visible = true;
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * 0.5;

  const resize = (): void => {
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    gl.viewport(0, 0, cv.width, cv.height);
  };
  addEventListener("resize", resize);
  resize();

  if (fine) {
    addEventListener("pointermove", (event) => {
      tx = event.clientX / innerWidth - 0.5;
      ty = 0.5 - event.clientY / innerHeight;
    });
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
    }).observe(cv);
  }

  const t0 = performance.now();
  const draw = (now: number): void => {
    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;
    gl.uniform1f(uTime, (now - t0) / 1000 + 3);
    gl.uniform2f(uRes, cv.width, cv.height);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  if (reduced || freezeMs !== null) {
    let frames = 0;
    const still = (): void => {
      resize();
      draw(t0 + (freezeMs ?? 4000));
      if (++frames < 30) requestAnimationFrame(still);
    };
    still();
    return;
  }

  const loop = (now: number): void => {
    if (visible && !document.hidden) draw(now);
    requestAnimationFrame(loop);
  };
  loop(t0);
})();
