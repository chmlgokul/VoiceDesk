import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh } from "three";

function RoundedVisor({ width, height, radius, color, z }: { width: number; height: number; radius: number; color: string; z: number }) {
  const geometry = useMemo(() => {
    const x = width / 2;
    const y = height / 2;
    const r = Math.min(radius, x, y);
    const shape = new THREE.Shape();
    shape.moveTo(-x + r, -y);
    shape.lineTo(x - r, -y);
    shape.quadraticCurveTo(x, -y, x, -y + r);
    shape.lineTo(x, y - r);
    shape.quadraticCurveTo(x, y, x - r, y);
    shape.lineTo(-x + r, y);
    shape.quadraticCurveTo(-x, y, -x, y - r);
    shape.lineTo(-x, -y + r);
    shape.quadraticCurveTo(-x, -y, -x + r, -y);
    return new THREE.ShapeGeometry(shape, 28);
  }, [width, height, radius]);

  return (
    <mesh geometry={geometry} position={[0, 0.83, z]} renderOrder={10}>
      <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} />
    </mesh>
  );
}

function RobotModel({ speaking = false, listening = false }: { speaking?: boolean; listening?: boolean }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const waveArm = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);
  const mouth = useRef<Mesh>(null);
  const chestLight = useRef<Mesh>(null);
  const blinkAt = useRef(2.1);
  const blinkUntil = useRef(0);
  const accentFrom = useRef(new THREE.Color("#8a35f2"));
  const accentTarget = useRef(new THREE.Color("#3978ff"));
  const accentCurrent = useRef(new THREE.Color("#8a35f2"));
  const accentChangeAt = useRef(0);
  const accentNextChange = useRef(2.5 + Math.random() * 2.5);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (root.current) {
      root.current.position.y = Math.sin(t * 1.45) * 0.025;
      root.current.rotation.y = Math.sin(t * 0.42) * 0.025;

      // Pick fully random RGB colours (0-255 per channel) and smoothly
      // transition between them. White materials and the dark face visor
      // stay unchanged so the robot remains readable.
      if (t >= accentNextChange.current) {
        accentFrom.current.copy(accentCurrent.current);
        accentTarget.current.setRGB(
          Math.floor(Math.random() * 256) / 255,
          Math.floor(Math.random() * 256) / 255,
          Math.floor(Math.random() * 256) / 255,
        );
        accentChangeAt.current = t;
        accentNextChange.current = t + 2.5 + Math.random() * 2.5;
      }

      const transition = THREE.MathUtils.clamp(
        (t - accentChangeAt.current) / 1.8,
        0,
        1,
      );
      accentCurrent.current.copy(accentFrom.current).lerp(
        accentTarget.current,
        1 - Math.pow(1 - transition, 3),
      );
      const animatedAccent = accentCurrent.current;

      root.current.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        materials.forEach((material) => {
          const mat = material as THREE.MeshStandardMaterial;
          if (!mat.color) return;

          if (!mat.userData.voiceDeskBaseColor) {
            mat.userData.voiceDeskBaseColor = `#${mat.color.getHexString()}`;
          }

          const base = new THREE.Color(mat.userData.voiceDeskBaseColor as string);
          const hex = base.getHexString();
          const isWhite = base.r > 0.93 && base.g > 0.93 && base.b > 0.93;
          const isDarkFaceVisor = hex === "171329";

          // Animate every originally coloured part, not white shell/eyes or visor.
          if (!isWhite && !isDarkFaceVisor) {
            mat.color.copy(animatedAccent);
            if (mat.emissive) mat.emissive.copy(animatedAccent);
          }
        });
      });
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.72) * 0.025;
      head.current.rotation.z = Math.sin(t * 0.9) * 0.012;
    }
    if (waveArm.current) {
      // A lifted arm waves from the shoulder, with a small wrist follow-through.
      waveArm.current.rotation.z = -0.10 + Math.sin(t * 4.4) * 0.19;
      waveArm.current.rotation.x = Math.sin(t * 3.2) * 0.035;
    }
    if (wrist.current) wrist.current.rotation.z = Math.sin(t * 4.4 + 0.7) * 0.22;

    if (t > blinkAt.current) {
      blinkUntil.current = t + 0.13;
      blinkAt.current = t + 2.4 + Math.random() * 2.5;
    }
    const blinking = t < blinkUntil.current;
    const blinkScale = blinking ? Math.max(0.08, Math.sin(((blinkUntil.current - t) / 0.13) * Math.PI)) : 1;
    if (leftEye.current) leftEye.current.scale.y = 0.12 * blinkScale;
    if (rightEye.current) rightEye.current.scale.y = 0.12 * blinkScale;
    if (mouth.current) {
      const talking = speaking || listening;
      mouth.current.scale.y = talking ? 0.065 + (Math.sin(t * 15) + 1) * 0.045 : 0.055;
      mouth.current.scale.x = talking ? 0.16 + (Math.sin(t * 11) + 1) * 0.025 : 0.15;
    }
    if (chestLight.current) {
      const pulse = 0.85 + (Math.sin(t * 2.6) + 1) * 0.18;
      chestLight.current.scale.set(0.135 * pulse, 0.135 * pulse, 0.035);
    }
  });

  const white = "#fdfbff";
  const purple = "#8a35f2";
  const violet = "#b45cff";
  const dark = "#171329";

  return (
    <group ref={root}>
      {/* Antennae */}
      <group position={[-0.38, 1.38, 0]} rotation={[0, 0, -0.18]}>
        <mesh position={[0, 0.22, 0]} rotation={[0, 0, -0.12]}><cylinderGeometry args={[0.035, 0.05, 0.48, 20]} /><meshStandardMaterial color={purple} metalness={0.65} roughness={0.24} /></mesh>
        <mesh position={[-0.04, 0.48, 0]}><sphereGeometry args={[0.105, 28, 28]} /><meshStandardMaterial color={violet} emissive={purple} emissiveIntensity={1.2} metalness={0.3} roughness={0.18} /></mesh>
      </group>
      <group position={[0.4, 1.38, 0]} rotation={[0, 0, 0.2]}>
        <mesh position={[0, 0.22, 0]} rotation={[0, 0, 0.12]}><cylinderGeometry args={[0.035, 0.05, 0.48, 20]} /><meshStandardMaterial color={purple} metalness={0.65} roughness={0.24} /></mesh>
        <mesh position={[0.04, 0.48, 0]}><sphereGeometry args={[0.105, 28, 28]} /><meshStandardMaterial color={violet} emissive={purple} emissiveIntensity={1.2} metalness={0.3} roughness={0.18} /></mesh>
      </group>

      {/* Detailed head shell. Face layers sit clearly in front of the shell to prevent the visor hiding the eyes. */}
      <group ref={head}>
        <mesh position={[0, 0.83, 0]} scale={[0.83, 0.7, 0.48]}><sphereGeometry args={[1, 48, 36]} /><meshStandardMaterial color={white} metalness={0.26} roughness={0.19} /></mesh>
        <RoundedVisor width={1.52} height={1.12} radius={0.31} color={purple} z={0.535} />
        <RoundedVisor width={1.39} height={0.99} radius={0.28} color={dark} z={0.55} />
        {/* Subtle visor highlight */}
        <mesh position={[-0.38, 1.16, 0.565]} rotation={[0, 0, -0.55]} scale={[0.12, 0.035, 0.008]} renderOrder={12}><sphereGeometry args={[1, 20, 16]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.78} depthTest={false} /></mesh>
        <mesh ref={leftEye} position={[-0.245, 0.94, 0.59]} scale={[0.09, 0.12, 0.028]} renderOrder={13}><sphereGeometry args={[1, 28, 24]} /><meshBasicMaterial color="#fffaff" /></mesh>
        <mesh ref={rightEye} position={[0.245, 0.94, 0.59]} scale={[0.09, 0.12, 0.028]} renderOrder={13}><sphereGeometry args={[1, 28, 24]} /><meshBasicMaterial color="#fffaff" /></mesh>
        <mesh position={[-0.43, 0.73, 0.588]} scale={[0.09, 0.055, 0.022]} renderOrder={13}><sphereGeometry args={[1, 24, 20]} /><meshBasicMaterial color="#ff9cda" /></mesh>
        <mesh position={[0.43, 0.73, 0.588]} scale={[0.09, 0.055, 0.022]} renderOrder={13}><sphereGeometry args={[1, 24, 20]} /><meshBasicMaterial color="#ff9cda" /></mesh>
        <mesh ref={mouth} position={[0, 0.68, 0.592]} scale={[0.15, 0.055, 0.025]} renderOrder={14}><sphereGeometry args={[1, 28, 24]} /><meshBasicMaterial color="#e8a6ff" /></mesh>
      </group>

      {/* Ear pods */}
      {[-1, 1].map((side) => <group key={side} position={[side * 0.79, 0.84, 0]}>
        <mesh scale={[0.2, 0.34, 0.34]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={purple} metalness={0.5} roughness={0.22} /></mesh>
        <mesh position={[side * 0.045, 0, 0.015]} scale={[0.14, 0.25, 0.27]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={white} metalness={0.25} roughness={0.2} /></mesh>
        <mesh position={[side * 0.075, 0, 0.04]} scale={[0.055, 0.15, 0.17]}><sphereGeometry args={[1, 28, 24]} /><meshStandardMaterial color={violet} emissive={purple} emissiveIntensity={0.65} /></mesh>
      </group>)}

      {/* Rounded body and illuminated chest */}
      <mesh position={[0, -0.05, 0]} scale={[0.58, 0.65, 0.42]}><sphereGeometry args={[1, 40, 32]} /><meshStandardMaterial color={white} metalness={0.24} roughness={0.21} /></mesh>
      <mesh position={[0, 0.05, 0.405]} scale={[0.2, 0.2, 0.055]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={purple} emissive={purple} emissiveIntensity={1.05} metalness={0.2} roughness={0.2} /></mesh>
      <mesh ref={chestLight} position={[0, 0.05, 0.45]} scale={[0.135, 0.135, 0.035]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color="#e9c7ff" emissive={violet} emissiveIntensity={1.2} /></mesh>
      <mesh position={[0, -0.28, 0.37]} scale={[0.055, 0.055, 0.03]}><sphereGeometry args={[1, 24, 20]} /><meshStandardMaterial color={purple} emissive={purple} emissiveIntensity={0.7} /></mesh>

      {/* Raised waving arm with articulated forearm, wrist, palm and fingers */}
      <group ref={waveArm} position={[-0.52, 0.24, 0.04]}>
        <mesh position={[-0.11, 0.07, 0]} rotation={[0, 0, -0.42]}><capsuleGeometry args={[0.13, 0.31, 10, 18]} /><meshStandardMaterial color={white} metalness={0.22} roughness={0.21} /></mesh>
        <mesh position={[-0.2, 0.25, 0.015]} scale={[0.13, 0.13, 0.12]}><sphereGeometry args={[1, 28, 24]} /><meshStandardMaterial color={purple} metalness={0.38} roughness={0.2} /></mesh>
        <mesh position={[-0.23, 0.4, 0.025]} rotation={[0, 0, -0.15]}><capsuleGeometry args={[0.105, 0.22, 10, 18]} /><meshStandardMaterial color={white} metalness={0.22} roughness={0.2} /></mesh>
        <group ref={wrist} position={[-0.24, 0.52, 0.045]}>
          <mesh scale={[0.19, 0.18, 0.09]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={white} metalness={0.22} roughness={0.2} /></mesh>
          <mesh position={[0, -0.015, 0.085]} scale={[0.07, 0.07, 0.022]}><sphereGeometry args={[1, 24, 20]} /><meshStandardMaterial color={violet} emissive={purple} emissiveIntensity={0.9} /></mesh>
          {[-0.135, -0.045, 0.045, 0.135].map((x, i) => <mesh key={i} position={[x, 0.16 + (i === 1 || i === 2 ? 0.025 : 0), 0.005]} rotation={[0, 0, (i - 1.5) * -0.13]}><capsuleGeometry args={[0.042, 0.12, 8, 14]} /><meshStandardMaterial color={i % 2 ? white : violet} metalness={0.25} roughness={0.22} /></mesh>)}
          <mesh position={[-0.18, 0.035, 0.015]} rotation={[0, 0, -0.65]}><capsuleGeometry args={[0.045, 0.1, 8, 14]} /><meshStandardMaterial color={white} metalness={0.2} roughness={0.2} /></mesh>
        </group>
      </group>

      {/* Resting arm */}
      <group position={[0.53, 0.16, 0.02]} rotation={[0, 0, -0.45]}>
        <mesh position={[0.08, -0.2, 0]}><capsuleGeometry args={[0.13, 0.36, 10, 18]} /><meshStandardMaterial color={white} metalness={0.2} roughness={0.22} /></mesh>
        <mesh position={[0.1, -0.44, 0.02]} scale={[0.14, 0.16, 0.12]}><sphereGeometry args={[1, 28, 24]} /><meshStandardMaterial color={white} metalness={0.2} roughness={0.2} /></mesh>
      </group>

      {/* Legs and boots */}
      {[-1, 1].map((side) => <group key={side} position={[side * 0.29, -0.65, 0]}>
        <mesh position={[0, -0.16, 0]} scale={[0.2, 0.29, 0.23]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={white} metalness={0.2} roughness={0.22} /></mesh>
        <mesh position={[0, -0.4, 0.09]} scale={[0.26, 0.16, 0.36]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={white} metalness={0.2} roughness={0.2} /></mesh>
        <mesh position={[0, -0.49, 0.1]} scale={[0.26, 0.055, 0.36]}><sphereGeometry args={[1, 32, 28]} /><meshStandardMaterial color={purple} metalness={0.45} roughness={0.2} /></mesh>
        <mesh position={[side * -0.13, -0.16, 0.2]} scale={[0.07, 0.11, 0.04]}><sphereGeometry args={[1, 24, 20]} /><meshStandardMaterial color={violet} emissive={purple} emissiveIntensity={1.05} /></mesh>
      </group>)}
    </group>
  );
}

export default function VoiceDeskRobot3D({ speaking = false }: { speaking?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0.45, 4.65], fov: 35 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%", background: "transparent", display: "block" }}
    >
      <ambientLight intensity={1.25} />
      <directionalLight position={[3, 5, 5]} intensity={2.15} />
      <pointLight position={[-3, 1, 3]} color="#b45cff" intensity={1.5} />
      <pointLight position={[2, -1, 2]} color="#f0bfff" intensity={0.75} />
      <RobotModel speaking={speaking} listening={speaking} />
    </Canvas>
  );
}