'use client';

// src/components/plan/PlanSummary.tsx
// Displays float plan summary with all details

import type { FloatPlan } from '@/types/api';
import { getConditionColorClass } from '@/lib/calculations/conditions';

interface PlanSummaryProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  onClose: () => void;
  onShare: () => void;
}

export default function PlanSummary({
  plan,
  isLoading,
  onClose,
  onShare,
}: PlanSummaryProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Float Plan</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* River Name */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{plan.river.name}</h3>
      </div>

      {/* Put-in / Take-out */}
      <div className="mb-4 space-y-2">
        <div>
          <span className="text-sm font-medium text-gray-600">Put-in:</span>
          <p className="text-gray-900">{plan.putIn.name}</p>
          <p className="text-xs text-gray-500">River Mile {plan.putIn.riverMile.toFixed(1)}</p>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-600">Take-out:</span>
          <p className="text-gray-900">{plan.takeOut.name}</p>
          <p className="text-xs text-gray-500">River Mile {plan.takeOut.riverMile.toFixed(1)}</p>
        </div>
      </div>

      {/* Distance */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium text-gray-600">Distance:</span>
        <p className="text-xl font-bold text-gray-900">{plan.distance.formatted}</p>
      </div>

      {/* Float Time */}
      {plan.floatTime ? (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-gray-600">Estimated Float Time:</span>
          <p className="text-xl font-bold text-blue-900">{plan.floatTime.formatted}</p>
          <p className="text-xs text-gray-600">at {plan.floatTime.speedMph} mph</p>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-red-50 rounded-lg">
          <p className="text-sm text-red-800">
            Float time cannot be calculated due to water conditions
          </p>
        </div>
      )}

      {/* Drive Back */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium text-gray-600">Drive-back Time:</span>
        <p className="text-lg font-semibold text-gray-900">{plan.driveBack.formatted}</p>
        <p className="text-xs text-gray-600">{plan.driveBack.miles.toFixed(1)} miles</p>
      </div>

      {/* Condition Badge */}
      <div className="mb-4">
        <span className="text-sm font-medium text-gray-600 mb-2 block">Current Conditions:</span>
        <div
          className={`inline-block px-3 py-1 rounded-full border text-sm font-medium ${getConditionColorClass(
            plan.condition.code
          )}`}
        >
          {plan.condition.label}
        </div>
        {plan.condition.gaugeHeightFt && (
          <p className="text-xs text-gray-600 mt-1">
            Gauge: {plan.condition.gaugeHeightFt.toFixed(2)} ft
          </p>
        )}
        {plan.condition.accuracyWarning && (
          <p className="text-xs text-orange-600 mt-1">
            ⚠️ {plan.condition.accuracyWarningReason}
          </p>
        )}
      </div>

      {/* Hazards */}
      {plan.hazards.length > 0 && (
        <div className="mb-4">
          <span className="text-sm font-medium text-gray-600 mb-2 block">Hazards:</span>
          <ul className="space-y-1">
            {plan.hazards.map((hazard) => (
              <li key={hazard.id} className="text-sm text-gray-700">
                <span className="font-medium">{hazard.name}</span>
                {' - '}
                <span className="text-gray-600">Mile {hazard.riverMile.toFixed(1)}</span>
                {hazard.severity === 'danger' && (
                  <span className="ml-2 text-red-600 font-semibold">⚠️ Danger</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <span className="text-sm font-medium text-yellow-800 mb-2 block">Warnings:</span>
          <ul className="space-y-1">
            {plan.warnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-yellow-700">• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-6">
        <button
          onClick={onShare}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Share Plan
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
