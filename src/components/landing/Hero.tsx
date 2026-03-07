"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 py-32 sm:px-6 sm:py-40 lg:px-8">
      {/* Background gradient orbs */}
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, -30, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-40 right-[-10%] -z-10 h-[700px] w-[700px] rounded-full bg-primary/30 blur-[150px]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, 20, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -bottom-20 left-[-5%] -z-10 h-[600px] w-[600px] rounded-full bg-accent/25 blur-[130px]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, 15, 0], x: [0, -10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[140px]"
      />

      <div className="mx-auto max-w-4xl text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.4, 0.25, 1] }}
          className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl"
        >
          Your habits,{" "}
          <span className="animate-gradient-x bg-gradient-to-r from-primary via-primary-light to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
            designed by AI.
          </span>{" "}
          Coached daily.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
          className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-muted sm:text-xl"
        >
          Inner Voice reads your sleep, calendar, screen time, and energy — then
          prescribes one small experiment at a time. Not another tracker. A system that acts.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
          className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row"
        >
          <Link
            href="/register"
            className="inline-flex h-14 items-center justify-center rounded-xl bg-primary px-10 text-lg font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:bg-primary-light hover:shadow-primary/50 hover:scale-[1.02]"
          >
            Start in 60 Seconds
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-14 items-center justify-center rounded-xl border border-card-border px-10 text-lg font-semibold text-muted transition-all hover:border-primary hover:text-foreground hover:shadow-lg hover:shadow-primary/10"
          >
            See How It Works
          </a>
        </motion.div>
      </div>

      {/* Animated gradient line below hero */}
      <div className="absolute bottom-0 left-0 right-0 h-px animate-line-flow bg-gradient-to-r from-transparent via-primary/50 to-transparent bg-[length:200%_100%]" />
    </section>
  );
}
