/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useEffect, useState, useRef } from "react";

const LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";

interface HackerTextProps {
  text: string;
  className?: string;
  speed?: number; // ms per frame
}

export function HackerText({ text, className, speed = 30 }: HackerTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const scramble = () => {
    let iteration = 0;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setDisplayText((prev) =>
        text
          .split("")
          .map((letter, index) => {
            if (index < iteration) {
              return text[index];
            }
            return LETTERS[Math.floor(Math.random() * 26)];
          })
          .join(""),
      );

      if (iteration >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }

      iteration += 1 / 3; // Controls the speed of the "lock in" (lower = slower resolve)
    }, speed);
  };

  // Scramble on mount
  useEffect(() => {
    scramble();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      className={className}
      onMouseEnter={scramble} // Re-scramble on hover for fun
      style={{ fontFamily: "monospace" }} // Monospace ensures letters don't jump around
    >
      {displayText}
    </span>
  );
}
