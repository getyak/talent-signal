"use client";

import { List, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { accessRequestHref, navigation } from "@/lib/site";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSectionHref, setActiveSectionHref] = useState("/#product");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const currentHref =
    pathname === "/"
      ? activeSectionHref
      : pathname.startsWith("/blog")
        ? "/blog"
        : navigation.find((item) => item.href === pathname)?.href ?? null;

  useEffect(() => {
    if (pathname !== "/") {
      return;
    }

    const sectionLinks = navigation.filter((item) => item.href.startsWith("/#"));
    const sections = sectionLinks
      .map((item) => document.querySelector<HTMLElement>(item.href.slice(1)))
      .filter((section): section is HTMLElement => section !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleSection) {
          setActiveSectionHref(`/#${visibleSection.target.id}`);
        }
      },
      {
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1041px)");

    function closeMenuAtDesktop(event: MediaQueryListEvent) {
      if (event.matches) {
        setMenuOpen(false);
      }
    }

    desktopQuery.addEventListener("change", closeMenuAtDesktop);

    return () => {
      desktopQuery.removeEventListener("change", closeMenuAtDesktop);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const main = document.querySelector("main");
    const footer = document.querySelector("footer");
    const mainWasInert = main?.hasAttribute("inert") ?? false;
    const footerWasInert = footer?.hasAttribute("inert") ?? false;
    const previousOverflow = document.body.style.overflow;

    main?.setAttribute("inert", "");
    footer?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";

    return () => {
      if (!mainWasInert) {
        main?.removeAttribute("inert");
      }
      if (!footerWasInert) {
        footer?.removeAttribute("inert");
      }
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleHeaderKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      closeMenu();
      menuButtonRef.current?.focus();
    }
  }

  return (
    <header className="site-header" onKeyDown={handleHeaderKeyDown}>
      <div className="site-header__inner">
        <BrandMark />

        <nav className="desktop-nav" aria-label="主导航">
          {navigation.map((item) => {
            const isCurrent = item.href === currentHref;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? "location" : undefined}
                data-current={isCurrent || undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />
          <Link
            className="desktop-account-link desktop-header-action"
            href="/login?callbackUrl=/workspace"
          >
            登录
          </Link>
          <a
            className="button button--compact desktop-header-action"
            href={accessRequestHref}
          >
            申请使用
          </a>
          <button
            ref={menuButtonRef}
            className="icon-button menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "关闭导航" : "打开导航"}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? (
              <X aria-hidden="true" size={20} />
            ) : (
              <List aria-hidden="true" size={20} />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="mobile-nav"
          aria-label="移动端导航"
        >
          <div className="mobile-nav__context">
            <span>沿着信号继续</span>
            <strong>从证据走向一个稳妥的下一步。</strong>
          </div>
          {navigation.map((item) => {
            const isCurrent = item.href === currentHref;

            return (
              <Link
                key={item.href}
                className="mobile-nav__link"
                href={item.href}
                aria-current={isCurrent ? "location" : undefined}
                data-current={isCurrent || undefined}
                onClick={closeMenu}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Link>
            );
          })}
          <Link
            className="mobile-nav__account"
            href="/login?callbackUrl=/workspace"
            onClick={closeMenu}
          >
            登录
          </Link>
          <a
            className="button mobile-nav__access"
            href={accessRequestHref}
            onClick={closeMenu}
          >
            申请使用
          </a>
        </nav>
      )}
    </header>
  );
}
