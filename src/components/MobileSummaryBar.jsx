// src/components/MobileSummaryBar.jsx
import React from "react";

export default function MobileSummaryBar({ totalINR, onOpenSummary }) {
  return (
    <div className="mobile-summary-bar">
      <div className="mobile-summary-inner">
        <div className="mobile-summary-main">
          <span className="mobile-summary-label">Trip estimate</span>
          <span className="mobile-summary-total">
            {totalINR || "Select locations & adventures"}
          </span>
        </div>
        <button className="btn-mobile-summary" onClick={onOpenSummary}>
          View breakdown
        </button>
      </div>
    </div>
  );
}
