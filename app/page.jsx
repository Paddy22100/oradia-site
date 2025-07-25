"use client";

import React, { useEffect } from "react";
import "./globals.css";

export default function Home() {
  useEffect(() => {
    const scrollTopBtn = document.getElementById("scrollTop");
    if (scrollTopBtn) {
      const handleScroll = () => {
        if (window.pageYOffset > 300) {
          scrollTopBtn.classList.add("show");
        } else {
          scrollTopBtn.classList.remove("show");
        }
      };

      const handleClick = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      };

if (window) {       window.addEventListener("scroll", handleScroll); }
if (scrollTopBtn) {       scrollTopBtn.addEventListener("click", handleClick); }

      return () => {
        window.removeEventListener("scroll", handleScroll);
        scrollTopBtn.removeEventListener("click", handleClick);
      };
    }
  }, []);

  return (
    <div className="relative">
      <button
        id="scrollTop"
        className="hidden fixed bottom-5 right-5 bg-blue-500 text-white p-2 rounded"
      >
        ↑ Haut
      </button>
      {/* CONTENU */}
    </div>
  );
}
