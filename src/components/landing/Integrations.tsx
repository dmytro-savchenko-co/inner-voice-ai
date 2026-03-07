"use client";

import { motion } from "framer-motion";

const brands = [
  "Google Calendar",
  "Apple Calendar",
  "Outlook",
  "iOS Screen Time",
  "Android Digital Wellbeing",
  "Apple Health",
  "Oura",
];

export default function Integrations() {
  return (
    <section id="integrations" className="px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Live Signal Integration
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Real data feeds replace manual self-report. If not connected, the system falls back gracefully.
          </p>
        </motion.div>

        {/* Shimmer overlay container */}
        <div className="relative mt-14">
          <div className="pointer-events-none absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-primary/5 to-transparent bg-[length:200%_100%] rounded-2xl" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            {brands.map((brand, index) => (
              <motion.div
                key={brand}
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0 0 20px rgba(13, 148, 136, 0.2)",
                  borderColor: "rgba(13, 148, 136, 0.5)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="rounded-full border border-card-border/50 bg-card/50 px-7 py-3.5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-card/80"
              >
                {brand}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
