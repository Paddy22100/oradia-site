import React from 'react';
import '../globals.css';

export default function Home() {
  return (
    <>
      {/* Le contenu du body du fichier DeepSite adapté */}
      <div className="relative">
        {/* Scroll to top button */}
        <button id="scrollTop" className="scroll-top bg-night-blue text-gold p-3 rounded-full border border-gold shadow-lg">
          <i className="fas fa-arrow-up"></i>
        </button>

        {/* Header */}
        <header className="header-bg fixed w-full z-50 py-4 px-6 flex justify-between items-center">
          <div className="flex items-center">
            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16 mr-4"></div>
            <span className="cormorant text-3xl font-bold gold-gradient">ORADIA</span>
          </div>
          {/* ... (mets ici tout le reste du code HTML du <body>) */}
        </header>
      </div>
    </>
  );
}
