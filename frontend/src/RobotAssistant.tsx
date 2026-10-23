import { useRef } from "react";

import { Canvas, useFrame } from "@react-three/fiber";

import { ContactShadows, Float, Sparkles } from "@react-three/drei";

import * as THREE from "three";



type RobotState = "ready" | "listening" | "processing" | "success" | "error";



interface RobotAssistantProps {

  state?: RobotState;

}



function FoxCompanion({ state }: { state: RobotState }) {

  const fox = useRef<THREE.Group>(null);

  const head = useRef<THREE.Group>(null);

  const leftEar = useRef<THREE.Group>(null);

  const rightEar = useRef<THREE.Group>(null);

  const tail = useRef<THREE.Group>(null);

  const leftEye = useRef<THREE.Mesh>(null);

  const rightEye = useRef<THREE.Mesh>(null);

  const mouth = useRef<THREE.Mesh>(null);

  const chestLight = useRef<THREE.Mesh>(null);



  const listening = state === "listening";

  const thinking = state === "processing";

  const success = state === "success";

  const error = state === "error";



  const accent = error ? "#ff5d7a" : success ? "#5bffc7" : listening ? "#55f0ff" : "#a78bfa";



  useFrame(({ clock }) => {

    const t = clock.getElapsedTime();



    if (fox.current) {

      fox.current.position.y = Math.sin(t * (listening ? 5 : 1.8)) * (listening ? 0.075 : 0.035);

      fox.current.rotation.y = Math.sin(t * (listening ? 2.4 : 0.65)) * (listening ? 0.18 : 0.07);

      fox.current.rotation.z = Math.sin(t * 1.4) * 0.018;

      const bounce = success ? 1 + Math.max(0, Math.sin(t * 9)) * 0.035 : 1;

      fox.current.scale.setScalar(bounce);

    }



    if (head.current) {

      head.current.rotation.y = Math.sin(t * (listening ? 4 : 1.1)) * (listening ? 0.2 : 0.08);

      head.current.rotation.x = Math.sin(t * 1.6) * 0.035 + (thinking ? Math.sin(t * 5) * 0.09 : 0);

      head.current.rotation.z = Math.sin(t * 1.3) * 0.025;

    }



    if (leftEar.current && rightEar.current) {

      const twitch = Math.sin(t * (listening ? 9 : 2.2)) * (listening ? 0.18 : 0.045);

      leftEar.current.rotation.z = 0.18 + twitch;

      rightEar.current.rotation.z = -0.18 - twitch;

      leftEar.current.rotation.x = Math.sin(t * 1.8) * 0.06;

      rightEar.current.rotation.x = -Math.sin(t * 1.8) * 0.06;

    }



    if (tail.current) {

      tail.current.rotation.y = Math.sin(t * (listening ? 8 : success ? 7 : 2.1)) * (listening || success ? 0.72 : 0.35);

      tail.current.rotation.z = Math.sin(t * 2.5) * 0.1;

    }



    // A friendly mouth pulse simulates speech while the assistant is active.

    if (mouth.current) {

      const speaking = listening || thinking;

      mouth.current.scale.y = speaking ? 0.7 + (Math.sin(t * 13) + 1) * 0.55 : 0.8;

      mouth.current.scale.x = speaking ? 1 + Math.sin(t * 13) * 0.12 : 1;

    }



    const blink = Math.sin(t * 2.15) > 0.986 ? 0.12 : 1;

    const eyePulse = listening ? 1.2 + Math.sin(t * 9) * 0.18 : thinking ? 1 + Math.sin(t * 11) * 0.12 : 1;



    [leftEye.current, rightEye.current].forEach((eye) => {

      if (eye) {

        eye.scale.set(eyePulse, blink * eyePulse, eyePulse);

        const material = eye.material as THREE.MeshStandardMaterial;

        material.emissiveIntensity = listening ? 3.5 : thinking ? 2.6 : 1.7;

      }

    });



    if (chestLight.current) {

      chestLight.current.scale.setScalar(1 + ((listening || thinking) ? Math.sin(t * 9) * 0.14 : 0));

    }

  });



  return (

    <group ref={fox}>

      {/* Body */}

      <mesh position={[0, -0.38, 0]} castShadow>

        <capsuleGeometry args={[0.31, 0.48, 8, 20]} />

        <meshPhysicalMaterial color="#f1f2ff" metalness={0.18} roughness={0.27} clearcoat={0.8} />

      </mesh>



      {/* Belly panel */}

      <mesh position={[0, -0.42, 0.275]} scale={[0.68, 0.82, 0.18]}>

        <sphereGeometry args={[0.25, 24, 20]} />

        <meshStandardMaterial color="#d8dcf4" metalness={0.18} roughness={0.35} />

      </mesh>



      {/* Tiny paws */}

      {[-1, 1].map((side) => (

        <group key={side} position={[side * 0.31, -0.48, 0.03]}>

          <mesh rotation={[0, 0, side * -0.25]}>

            <capsuleGeometry args={[0.085, 0.2, 6, 12]} />

            <meshPhysicalMaterial color="#e9ebfa" metalness={0.15} roughness={0.28} />

          </mesh>

          <mesh position={[0, -0.12, 0.045]}>

            <sphereGeometry args={[0.09, 16, 12]} />

            <meshStandardMaterial color="#b9a5ff" />

          </mesh>

        </group>

      ))}



      {/* Glowing chest badge */}

      <mesh ref={chestLight} position={[0, -0.31, 0.34]}>

        <sphereGeometry args={[0.065, 24, 20]} />

        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.6} />

      </mesh>



      {/* Neck */}

      <mesh position={[0, 0.02, 0]}>

        <cylinderGeometry args={[0.11, 0.13, 0.16, 24]} />

        <meshStandardMaterial color="#c9cce3" metalness={0.25} />

      </mesh>



      {/* Fox head */}

      <group ref={head} position={[0, 0.43, 0]}>

        <mesh castShadow>

          <sphereGeometry args={[0.48, 40, 32]} />

          <meshPhysicalMaterial color="#f5f5ff" metalness={0.12} roughness={0.23} clearcoat={1} />

        </mesh>



        {/* White muzzle */}

        <mesh position={[0, -0.17, 0.39]} scale={[1, 0.62, 0.7]}>

          <sphereGeometry args={[0.22, 28, 20]} />

          <meshPhysicalMaterial color="#ffffff" roughness={0.3} />

        </mesh>



        {/* Tiny nose */}

        <mesh position={[0, -0.105, 0.55]} rotation={[0.15, 0, 0]}>

          <coneGeometry args={[0.045, 0.07, 3]} />

          <meshStandardMaterial color="#8f7bd7" />

        </mesh>



        {/* Face screen behind eyes */}

        <mesh position={[0, 0.025, 0.405]} scale={[1, 0.78, 0.22]}>

          <sphereGeometry args={[0.34, 36, 24]} />

          <meshBasicMaterial color="#101a3b" />

        </mesh>



        {/* Big bright eyes */}

        <mesh ref={leftEye} position={[-0.125, 0.055, 0.49]}>

          <sphereGeometry args={[0.052, 24, 20]} />

          <meshStandardMaterial color="#8ff7ff" emissive="#55eaff" emissiveIntensity={2.5} />

        </mesh>

        <mesh ref={rightEye} position={[0.125, 0.055, 0.49]}>

          <sphereGeometry args={[0.052, 24, 20]} />

          <meshStandardMaterial color="#8ff7ff" emissive="#55eaff" emissiveIntensity={2.5} />

        </mesh>



        {/* Mouth */}

        <mesh ref={mouth} position={[0, -0.105, 0.51]}>

          <sphereGeometry args={[0.045, 20, 16]} />

          <meshBasicMaterial color="#9da9d8" />

        </mesh>



        {/* Cheek lights */}

        {[-1, 1].map((side) => (

          <mesh key={side} position={[side * 0.235, -0.09, 0.405]}>

            <sphereGeometry args={[0.045, 18, 14]} />

            <meshStandardMaterial color="#f3a9d9" emissive="#e97ac8" emissiveIntensity={0.65} />

          </mesh>

        ))}



        {/* Tall fox ears */}

        <group ref={leftEar} position={[-0.3, 0.34, 0]}>

          <mesh rotation={[0, 0, 0.12]}>

            <coneGeometry args={[0.19, 0.53, 5]} />

            <meshPhysicalMaterial color="#e9eaff" metalness={0.1} roughness={0.28} clearcoat={0.8} />

          </mesh>

          <mesh position={[0, -0.025, 0.105]} rotation={[0, 0, 0.12]} scale={[0.62, 0.72, 0.3]}>

            <coneGeometry args={[0.15, 0.39, 5]} />

            <meshStandardMaterial color="#ad8cff" emissive="#8b5cf6" emissiveIntensity={0.35} />

          </mesh>

        </group>

        <group ref={rightEar} position={[0.3, 0.34, 0]}>

          <mesh rotation={[0, 0, -0.12]}>

            <coneGeometry args={[0.19, 0.53, 5]} />

            <meshPhysicalMaterial color="#e9eaff" metalness={0.1} roughness={0.28} clearcoat={0.8} />

          </mesh>

          <mesh position={[0, -0.025, 0.105]} rotation={[0, 0, -0.12]} scale={[0.62, 0.72, 0.3]}>

            <coneGeometry args={[0.15, 0.39, 5]} />

            <meshStandardMaterial color="#ad8cff" emissive="#8b5cf6" emissiveIntensity={0.35} />

          </mesh>

        </group>

      </group>



      {/* Segmented fox tail */}

      <group ref={tail} position={[0.22, -0.43, -0.18]}>

        <mesh position={[0.25, -0.01, -0.08]} rotation={[0, 0, -0.85]}>

          <capsuleGeometry args={[0.13, 0.48, 8, 16]} />

          <meshPhysicalMaterial color="#e7e9ff" metalness={0.12} roughness={0.28} clearcoat={0.7} />

        </mesh>

        <mesh position={[0.43, -0.23, -0.08]} rotation={[0, 0, -0.85]}>

          <coneGeometry args={[0.16, 0.28, 8]} />

          <meshStandardMaterial color="#a78bfa" emissive="#8b5cf6" emissiveIntensity={0.7} />

        </mesh>

        <mesh position={[0.48, -0.3, -0.07]}>

          <sphereGeometry args={[0.045, 16, 12]} />

          <meshStandardMaterial color="#62f2ff" emissive="#62f2ff" emissiveIntensity={2.2} />

        </mesh>

      </group>



      <Sparkles

        count={listening ? 42 : thinking ? 30 : 12}

        scale={[2.5, 2.7, 2]}

        size={listening ? 3 : 1.7}

        speed={listening ? 1.5 : thinking ? 1.9 : 0.3}

        color={accent}

        opacity={0.85}

      />

    </group>

  );

}



export default function RobotAssistant({ state = "ready" }: RobotAssistantProps) {

  const labels: Record<RobotState, string> = {

    ready: "✦ READY",

    listening: "◉ LISTENING",

    processing: "✧ THINKING",

    success: "✓ DONE",

    error: "⚠ CHECK MIC",

  };



  const accent = state === "error" ? "#ff5d7a" : state === "success" ? "#5bffc7" : state === "listening" ? "#55f0ff" : "#a78bfa";



  return (

    <div style={{ width: "100%", height: "100%", position: "relative" }}>

      <Canvas camera={{ position: [0, 0.1, 4.6], fov: 37 }} dpr={[1, 1.75]} gl={{ alpha: true, antialias: true }}>

        <ambientLight intensity={1.25} />

        <hemisphereLight args={["#e5e9ff", "#211640", 1.7]} />

        <directionalLight position={[3, 4, 5]} intensity={2.2} />

        <pointLight position={[-2, 1, 2]} color="#9b80ff" intensity={2.2} />

        <pointLight position={[2, -1, 1]} color={accent} intensity={state === "listening" ? 2.2 : 0.8} />



        <Float speed={state === "listening" ? 3.5 : state === "processing" ? 4 : 1.35}

          rotationIntensity={state === "listening" ? 0.18 : 0.06}

          floatIntensity={state === "listening" ? 0.42 : 0.22}>

          <FoxCompanion state={state} />

        </Float>



        <ContactShadows position={[0, -1.4, 0]} opacity={0.2} scale={3} blur={2} />

      </Canvas>



      <div style={{

        position: "absolute", left: 0, right: 0, bottom: 0,

        textAlign: "center", fontSize: 10, fontWeight: 800,

        letterSpacing: "1.7px", color: accent,

        textShadow: `0 0 12px ${accent}`, pointerEvents: "none"

      }}>

        {labels[state]}

      </div>

    </div>

  );

}