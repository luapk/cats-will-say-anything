import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CatsWillSayAnything from "./CatsWillSayAnything.jsx";
import BgRemovalComparison from "./BgRemovalComparison.jsx";
import SharePage from "./SharePage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CatsWillSayAnything />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/dev/bg-test" element={<BgRemovalComparison />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
