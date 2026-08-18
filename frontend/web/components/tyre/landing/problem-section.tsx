"use client";

/**
 * SCENE 2 — "A day in the old way." (v2)
 *
 * After the night hero, the page cuts to harsh daylight: the driver's day
 * as a logbook, scrubbed by scroll. A clock rail fills as you move through
 * 6:00 AM → 11:30 AM → 9:00 PM; each pain entry slides in from alternating
 * sides like pages of a manifest. Money pain is inked in ember — the only
 * place orange is allowed to speak. Ends on the pivot line that hands the
 * story to the product.
 */
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { CarFront, Hourglass, Banknote, ArrowDown } from "lucide-react";

const EXPO = [0.19, 1, 0.22, 1] as const;

const PAINS = [
  {
    icon: CarFront,
    time: "10:40 PM",
    title: "The drop is done — now what?",
    body: "Station to college, paid one way. The app marks the job complete; the 14 km back are yours to fund alone.",
    stat: "50%",
    statLabel: "of kilometres run empty",
  },
  {
    icon: Hourglass,
    time: "10:55 PM",
    title: "Someone is going your way right now",
    body: "A traveller at the college needs the station. A shop needs a parcel moved. You have no way to find each other.",
    stat: "2–4 hrs",
    statLabel: "idle time lost daily",
  },
  {
    icon: Banknote,
    time: "11:30 PM",
    title: "The empty leg eats the profit",
    body: "Fuel, tolls and time on the return wipe out the margin from the paid direction — for cabs, vans and trucks alike.",
    stat: "₹0",
    statLabel: "earned on the way back",
  },
];

export function ProblemSection() {
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);

  /* the clock rail fills as the reader lives through the day */
  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ["start 0.75", "end 0.55"],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });
  const fillScale = useTransform(fill, [0, 1], [0, 1]);

  return (
    <section id="problem" className="relative bg-background text-foreground overflow-hidden">
      {/* hard cut from night: thin signal line at the seam */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(61,107,255,0.55)] to-transparent" />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        {/* Heading */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: EXPO }}
          className="max-w-3xl"
        >
          <div className="tyre-eyebrow flex items-center gap-3">
            <span className="w-7 h-px bg-[var(--tyre-ember)]" />
            22:40 — 23:30 · The problem
          </div>
          <h2 className="tyre-display mt-6 text-[clamp(2.2rem,1.2rem+4vw,4.4rem)] leading-[1.02] text-[var(--tyre-ink)]">
            Half of every journey
            <br />
            is driven <em className="tyre-em text-[var(--tyre-ember)]">empty.</em>
          </h2>
          <p className="mt-6 text-[var(--muted-foreground)] text-base sm:text-lg max-w-xl leading-relaxed">
            One-way apps confirm the ride there and pretend the ride back doesn&apos;t exist.
            The rider overpays to cover it, the driver eats it. Here&apos;s one evening, the old way.
          </p>
        </motion.div>

        {/* Logbook — clock rail + alternating entries */}
        <div ref={railRef} className="relative mt-12 sm:mt-16">
          {/* rail */}
          <div className="absolute left-4 sm:left-1/2 sm:-translate-x-1/2 top-0 bottom-0 w-px bg-[rgba(18,16,11,0.12)]" aria-hidden>
            <motion.div
              className="absolute top-0 left-0 w-full origin-top"
              style={{
                scaleY: reduce ? 1 : fillScale,
                height: "100%",
                background: "linear-gradient(to bottom, var(--tyre-ember), rgba(255,90,30,0.25))",
              }}
            />
          </div>

          <div className="space-y-10 sm:space-y-14">
            {PAINS.map((p, i) => {
              const left = i % 2 === 0;
              return (
                <div
                  key={p.title}
                  className={`relative grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-16 items-center ${
                    left ? "" : ""
                  }`}
                >
                  {/* clock node on the rail */}
                  <div className="absolute left-4 sm:left-1/2 -translate-x-1/2 z-10">
                    <motion.span
                      initial={reduce ? false : { scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true, margin: "-30% 0px -30% 0px" }}
                      transition={{ type: "spring", stiffness: 320, damping: 18 }}
                      className="grid place-items-center w-9 h-9 rounded-full bg-background border-2 border-[var(--tyre-ember)] text-[var(--tyre-ember)]"
                    >
                      <p.icon className="w-4 h-4" />
                    </motion.span>
                  </div>

                  {/* time stamp — opposite side of the card */}
                  <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: "-20%" }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className={`hidden sm:flex ${left ? "sm:order-2 justify-start pl-4" : "sm:order-1 justify-end pr-4"}`}
                  >
                    <span className="tyre-num text-[clamp(2rem,1.4rem+2vw,3.4rem)] font-bold text-[rgba(18,16,11,0.14)] select-none">
                      {p.time}
                    </span>
                  </motion.div>

                  {/* logbook entry */}
                  <motion.article
                    initial={reduce ? false : { opacity: 0, x: left ? -48 : 48 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-15%" }}
                    transition={{ duration: 0.8, ease: EXPO }}
                    className={`${left ? "sm:order-1" : "sm:order-2"} ml-12 sm:ml-0 group relative rounded-[1.4rem] bg-card border border-[var(--border)] p-7 shadow-[0_1px_2px_rgba(28,22,12,0.05)] transition-shadow duration-500 hover:shadow-[0_28px_60px_-30px_rgba(28,22,12,0.35)]`}
                  >
                    <div className="flex items-center justify-between sm:hidden mb-4">
                      <span className="tyre-num text-[12px] tracking-wider text-[var(--muted-foreground)]">{p.time}</span>
                    </div>
                    <h3 className="text-[19px] font-bold leading-snug text-[var(--tyre-ink)]">{p.title}</h3>
                    <p className="mt-3 text-[13.5px] text-[var(--muted-foreground)] leading-relaxed">{p.body}</p>
                    <div className="mt-6 pt-5 border-t border-[var(--border)] flex items-baseline gap-2.5">
                      <span className="tyre-num text-[30px] font-bold leading-none text-[var(--tyre-ember)]">{p.stat}</span>
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                        {p.statLabel}
                      </span>
                    </div>
                  </motion.article>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pivot — the day ends, TYRE begins */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EXPO }}
          className="mt-14 sm:mt-20 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-8"
        >
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-[var(--tyre-ink)] text-[var(--tyre-violet-hot)] shrink-0 shadow-[inset_0_1px_0_rgba(255,250,235,0.15)]">
            <ArrowDown className="w-5 h-5" />
          </span>
          <p className="tyre-display text-[clamp(1.4rem,1rem+2vw,2.2rem)] leading-tight text-[var(--tyre-ink)]">
            TYRE turns the way back into{" "}
            <span className="text-[var(--tyre-violet-deep)]">a listing</span> — discounted for minutes,{" "}
            <span className="text-[var(--tyre-violet-deep)]">booked in seconds, paid both ways.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
