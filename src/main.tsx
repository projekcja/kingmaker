import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { migrateLegacyKeys } from "./net/storage";
import "./styles.css";

// The game used to be called Kingmaker and kept everything under a `km:`
// prefix. Bring a returning player's saves and trophies across before anything
// reads them, or a rename would look exactly like losing them.
migrateLegacyKeys();

const container = document.getElementById("root");
if (!container) throw new Error("root element missing from index.html");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
