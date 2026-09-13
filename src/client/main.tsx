import React from "react";
import { createRoot } from "react-dom/client";
import { ArenaClient } from './ArenaClient';

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ArenaClient />
  </React.StrictMode>
);