import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CatsWillSayAnything from "./CatsWillSayAnything.jsx";
import BgRemovalComparison from "./BgRemovalComparison.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CatsWillSayAnything />} />
        <Route path="/dev/bg-test" element={<BgRemovalComparison />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
