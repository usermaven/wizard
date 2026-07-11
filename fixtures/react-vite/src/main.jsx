import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <button onClick={() => window.alert("Synthetic checkout")}>Checkout</button>
  );
}

createRoot(document.getElementById("root")).render(<App />);
