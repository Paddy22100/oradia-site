"use client";
import { useState } from "react";
import Image from "next/image";

export default function Oracle() {
  const [loading, setLoading] = useState(false);
  const [tirage, setTirage] = useState([]);
  const [revealed, setRevealed] = useState([false, false, false, false, false, false]);

  const handleTirage = async () => {
    setLoading(true);
    setTirage([]);
    setRevealed([false, false, false, false, false, false]);

    try {
      const res = await fetch("/api/oracle");
      const data = await res.json();
      setTirage(data.tirage);
    } catch (err) {
      console.error("Erreur API :", err);
    } finally {
      setLoading(false);
    }
  };

  const flipCard = (index) => {
    const newRevealed = [...revealed];
    newRevealed[index] = true;
    setRevealed(newRevealed);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#0A0F2C] to-[#1A1F4C] text-[#D4AF37] font-sans p-4">
      <header className="mb-6">
        <Image src="/logo.png" alt="Logo Oradia" width={120} height={120} />
        <h1 className="text-4xl font-bold mt-4">Oracle Oradia</h1>
      </header>

      {!tirage.length && (
        <button
          onClick={handleTirage}
          disabled={loading}
          className="px-6 py-3 rounded-lg border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0A0F2C] transition font-bold mt-6"
        >
          {loading ? "Tirage en cours..." : "ðŸŽ´ Commencer le tirage"}
        </button>
      )}

      {tirage.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-8">
          {tirage.map((item, index) => (
            <div
              key={index}
              className="relative w-40 h-64 cursor-pointer perspective"
              onClick={() => flipCard(index)}
            >
              <div className={`transition-transform duration-700 transform ${revealed[index] ? "rotate-y-180" : ""} relative w-full h-full`}>
                {/* Dos de la carte */}
                <div className="absolute inset-0 backface-hidden bg-[#D4AF37] rounded-lg flex items-center justify-center shadow-lg">
                  <Image src="/cards/back.png" alt="Dos de la carte" fill className="object-cover rounded-lg" />
                </div>

                {/* Face de la carte */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-[#0A0F2C] text-[#D4AF37] rounded-lg p-4 flex flex-col justify-center items-center shadow-lg">
                  <h2 className="text-xl font-bold mb-2">{item.famille}</h2>
                  <p className="text-lg mb-2">{item.carte}</p>
                  <p className="text-sm text-center">{item.interpretation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tirage.length > 0 && revealed.every(Boolean) && (
        <button
          onClick={handleTirage}
          className="px-6 py-3 rounded-lg border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0A0F2C] transition font-bold mt-8"
        >
          ðŸ”„ Refaire un tirage
        </button>
      )}
    </main>
  );
}
