"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function CTA() {
  return (
    <section className="relative isolate overflow-hidden px-4 py-28 sm:px-6 lg:px-8">
      {/* Animated gradient border top */}
      <div className="absolute top-0 left-0 right-0 h-px animate-line-flow bg-gradient-to-r from-transparent via-primary/50 to-transparent bg-[length:200%_100%]" />

      {/* Animated gradient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 animate-gradient-x bg-gradient-to-br from-primary/8 via-primary/12 to-blue-500/5 bg-[length:200%_200%]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[150px]"
      />

      {/* Floating glowing dots */}
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-1/4 left-1/4 h-2 w-2 rounded-full bg-primary/40 blur-[2px]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, 15, 0], x: [0, -8, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute bottom-1/3 right-1/4 h-1.5 w-1.5 rounded-full bg-primary-light/30 blur-[1px]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-1/3 right-1/3 h-1 w-1 rounded-full bg-accent/30 blur-[1px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          One Habit. One Week. Real Change.
        </h2>
        <p className="mt-6 text-lg text-muted sm:text-xl">
          Not a program. A small experiment designed for your life right now. Free access.
        </p>
        <div className="mt-12">
          <Link
            href="/register"
            className="inline-flex h-16 items-center justify-center rounded-xl bg-primary px-12 text-lg font-semibold text-white shadow-xl shadow-primary/30 transition-all hover:bg-primary-light hover:shadow-primary/50 hover:scale-[1.02] animate-glow-pulse"
            style={{ animationDuration: "3s" }}
          >
            Start Your First Experiment
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
