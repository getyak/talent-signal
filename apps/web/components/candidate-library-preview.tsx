"use client";

import {
  ArrowRight,
  CardsThree,
  CheckCircle,
  ListBullets,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { candidateRecords } from "@/lib/candidates";

type PreviewView = "card" | "list";

export function CandidateLibraryPreview() {
  const [view, setView] = useState<PreviewView>("card");
  const candidates = candidateRecords.slice(0, 3);

  return (
    <div className="library-preview" aria-label="Interactive candidate library">
      <div className="library-preview__bar">
        <div>
          <p>Candidate library</p>
          <span>Sample workspace</span>
        </div>
        <div className="view-switch" aria-label="Candidate view">
          <button
            type="button"
            data-active={view === "card"}
            aria-pressed={view === "card"}
            onClick={() => setView("card")}
          >
            <CardsThree aria-hidden="true" size={16} />
            Cards
          </button>
          <button
            type="button"
            data-active={view === "list"}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <ListBullets aria-hidden="true" size={16} />
            List
          </button>
        </div>
      </div>

      <div className="library-preview__canvas" data-view={view}>
        <div className="library-preview__collection">
          {candidates.map((candidate) => (
            <article className="preview-candidate" key={candidate.id}>
              <div className="preview-candidate__identity">
                <span className="candidate-avatar">{candidate.initials}</span>
                <div>
                  <h3>{candidate.name}</h3>
                  <p>
                    {candidate.role}, {candidate.company}
                  </p>
                </div>
              </div>
              <div className="preview-candidate__signal">
                <span>{candidate.verdict}</span>
                <p>{candidate.currentSignal}</p>
              </div>
              <div className="candidate-tags" aria-label="Candidate context">
                {candidate.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="preview-candidate__time">
                <span>{candidate.lastInteraction}</span>
                <strong>{candidate.nextDue}</strong>
              </div>
            </article>
          ))}
        </div>

        <aside className="library-preview__wiki" aria-label="Candidate page">
          <div className="wiki-preview__heading">
            <span className="candidate-avatar candidate-avatar--large">LH</span>
            <div>
              <p>Candidate page</p>
              <h3>Leila Hartmann</h3>
              <span>VP Product, Berg & Finch</span>
            </div>
          </div>
          <div className="wiki-preview__decision">
            <span>Why now</span>
            <strong>Decision pressure with one unresolved constraint.</strong>
            <p>Confirm the remote policy before scheduling.</p>
          </div>
          <div className="wiki-preview__facts">
            {candidateRecords[0].facts.map((fact) => (
              <div key={fact.label}>
                <CheckCircle aria-hidden="true" size={16} />
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
          <Link className="text-link" href="/demo">
            Review the source evidence
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </aside>
      </div>
    </div>
  );
}
