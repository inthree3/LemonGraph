"use client";

import { useEffect } from "react";

export default function VideoPage() {
  useEffect(() => {
    window.location.replace("https://www.loom.com/share/6ccbc136332f4d178f845e45609cee62");
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <p>Redirecting to video...</p>
    </div>
  );
}
