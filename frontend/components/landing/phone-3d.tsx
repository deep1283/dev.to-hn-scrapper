"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { ContactShadows, Environment, Float, PerspectiveCamera, RoundedBox, useTexture } from "@react-three/drei"
import * as THREE from "three"
import { useIsMobile } from "@/hooks/use-mobile"

type PhoneModelProps = {
  isMobile: boolean
  reducedMotion: boolean
}

function PhoneModel({ isMobile, reducedMotion }: PhoneModelProps) {
  const meshRef = useRef<THREE.Group>(null)
  const texture = useTexture("/images/hero-phone-sketch.png")

  useFrame((state) => {
    if (!meshRef.current) return

    const t = state.clock.elapsedTime
    const baseX = reducedMotion ? 0 : Math.sin(t * 0.45) * 0.035
    const baseY = reducedMotion ? 0 : Math.cos(t * 0.35) * 0.05

    const pointerX = isMobile ? 0 : state.pointer.x * 0.2
    const pointerY = isMobile ? 0 : -state.pointer.y * 0.16

    const targetX = baseX + pointerY
    const targetY = baseY + pointerX

    meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetX, 0.08)
    meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetY, 0.08)
  })

  return (
    <group ref={meshRef}>
      <Float speed={1.25} rotationIntensity={0.2} floatIntensity={reducedMotion ? 0.4 : 0.8}>
        <RoundedBox args={[3.4, 7, 0.4]} radius={0.3} smoothness={4}>
          <meshStandardMaterial
            color="#2a2a2a" 
            metalness={0.8}
            roughness={0.2}
            emissive="#1a1a1a"
          />
        </RoundedBox>

        <mesh position={[0, 0, 0.21]}>
          <planeGeometry args={[3.1, 6.6]} />
          <meshBasicMaterial map={texture} />
        </mesh>

        <RoundedBox args={[3.5, 7.1, 0.35]} radius={0.32} smoothness={4}>
          <meshStandardMaterial
            color="#555"
            metalness={1}
            roughness={0.1}
            transparent
            opacity={0.3}
          />
        </RoundedBox>
      </Float>
    </group>
  )
}

export function Phone3D() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const dpr: number | [number, number] = isMobile ? 1 : [1, 1.75]

  return (
    <div className="relative h-[360px] w-full max-w-[520px] overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-b from-card to-secondary/60 shadow-[0_30px_80px_-35px_rgba(74,90,43,0.45)] sm:h-[460px]">
      <div className="pointer-events-none absolute inset-x-10 -top-16 h-44 rounded-full bg-accent/30 blur-3xl" />
      <Canvas
        shadows={!isMobile}
        dpr={dpr}
        gl={{ antialias: !isMobile, alpha: true, powerPreference: "high-performance" }}
        className="cursor-grab active:cursor-grabbing"
      >
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={40} />
          <ambientLight intensity={0.45} />
          <pointLight position={[8, 7, 10]} intensity={0.85} />
          <directionalLight position={[-6, 4, 7]} intensity={0.75} />

          <PhoneModel isMobile={isMobile} reducedMotion={reducedMotion} />

          {!isMobile && (
            <ContactShadows position={[0, -4.5, 0]} opacity={0.35} scale={14} blur={2.4} far={4.5} />
          )}
          {!isMobile && !reducedMotion && <Environment preset="studio" />}
        </Suspense>
      </Canvas>
    </div>
  )
}
