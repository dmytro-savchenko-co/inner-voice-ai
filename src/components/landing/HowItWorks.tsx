"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "1",
    title: "Connect & Answer",
    description: "Share your goal, sleep baseline, screen habits, and today's energy. Optionally link your calendar. Under 60 seconds.",
  },
  {
    number: "2",
    title: "Get Your Protocol",
    description: "The system explains what it found — in plain language. Then proposes one small experiment. One habit. A defined window. A reason that makes sense.",
  },
  {
    number: "3",
    title: "Daily Coaching Loop",
    description: "Evening nudge tied to your experiment. Morning check-in on sleep and energy. The system learns and adjusts over time.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            From Signal to Experiment — Under 60 Seconds
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Inner Voice opens as a calm, science-informed coach. The opening exchange covers five things.
          </p>
        </motion.div>

        <div className="relative mt-20 flex flex-col items-center gap-16 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          {/* Animated connecting line (desktop) */}
          <div
            aria-hidden="true"
            className="absolute top-10 right-[calc(16.67%+28px)] left-[calc(16.67%+28px)] hidden h-0.5 lg:block"
          >
            <div className="h-full w-full animate-line-flow bg-gradient-to-r from-primary/60 via-primary-light/40 to-primary/60 bg-[length:200%_100%]" />
          </div>

          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.2, ease: [0.25, 0.4, 0.25, 1] }}
              className="relative flex flex-col items-center text-center lg:flex-1"
            >
              {/* Numbered circle with glow */}
              <div className="relative z-10">
                <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/30 blur-xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary bg-background text-2xl font-bold text-primary shadow-xl shadow-primary/25">
                  {step.number}
                </div>
              </div>

              <div className="mt-8 rounded-xl bg-card/30 p-6 backdrop-blur-sm">
                <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-muted">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
