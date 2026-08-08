"use client";

import { Desktop, DeviceMobile } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

import { RelationshipDesktopConcept } from "@/components/relationship-desktop-concept";
import { RelationshipMobileConcept } from "@/components/relationship-mobile-concept";
import styles from "./relationship-experience-switcher.module.css";

type PreviewView = "desktop" | "iphone";

const PREVIEW_EVENT = "talent-signal:relationship-preview";

function getPreviewView(): PreviewView {
  if (typeof window === "undefined") {
    return "desktop";
  }

  return new URL(window.location.href).searchParams.get("view") === "iphone"
    ? "iphone"
    : "desktop";
}

function subscribeToPreviewView(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(PREVIEW_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(PREVIEW_EVENT, onStoreChange);
  };
}

function updatePreviewView(view: PreviewView) {
  const url = new URL(window.location.href);

  if (view === "iphone") {
    url.searchParams.set("view", "iphone");
  } else {
    url.searchParams.delete("view");
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

export function RelationshipExperienceSwitcher() {
  const view = useSyncExternalStore(
    subscribeToPreviewView,
    getPreviewView,
    () => "desktop" as const,
  );

  return (
    <>
      <div className={`shell ${styles.controlRow}`}>
        <span className={styles.controlLabel}>View</span>
        <div
          className={styles.segmentedControl}
          role="group"
          aria-label="Choose product preview"
        >
          <button
            className={view === "desktop" ? styles.active : undefined}
            type="button"
            aria-pressed={view === "desktop"}
            onClick={() => updatePreviewView("desktop")}
          >
            <Desktop aria-hidden="true" size={17} />
            Desktop
          </button>
          <button
            className={view === "iphone" ? styles.active : undefined}
            type="button"
            aria-pressed={view === "iphone"}
            onClick={() => updatePreviewView("iphone")}
          >
            <DeviceMobile aria-hidden="true" size={17} />
            iPhone
          </button>
        </div>
        <p className={styles.liveStatus} aria-live="polite">
          Showing the interactive {view === "iphone" ? "iPhone" : "desktop"}{" "}
          view.
        </p>
      </div>

      <div className={styles.preview} data-view={view}>
        <div className={styles.desktopView}>
          <RelationshipDesktopConcept />
        </div>
        <div className={styles.iphoneView}>
          <RelationshipMobileConcept presentation="product" />
        </div>
      </div>
    </>
  );
}
