/**
 * Price calculator component for previewing price calculations
 */

import { useState } from 'react';
import { Input } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../utils/currency';

interface PriceCalculatorProps {
  basePrice: number; // In rupees
  baseQuantity: number;
  baseUnit: string;
  isDivisible: boolean;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  variant?: {
    unit: string;
    baseQuantity: number;
    price: number; // In rupees
    isDivisible: boolean;
  };
}

export function PriceCalculator({
  basePrice,
  baseQuantity,
  baseUnit,
  isDivisible,
  minOrderQuantity,
  maxOrderQuantity,
  variant,
}: PriceCalculatorProps) {
  const [testQuantity, setTestQuantity] = useState<number>(minOrderQuantity || baseQuantity || 1);

  const pricePerUnit = variant ? variant.price / variant.baseQuantity : basePrice / baseQuantity;
  const unit = variant ? variant.unit : baseUnit;
  const divisible = variant ? variant.isDivisible : isDivisible;

  // Calculate final quantity (round up if not divisible)
  let finalQuantity = testQuantity;
  if (!divisible && finalQuantity % 1 !== 0) {
    finalQuantity = Math.ceil(finalQuantity);
  }

  // Validate quantity
  const errors: string[] = [];
  if (minOrderQuantity && testQuantity < minOrderQuantity) {
    errors.push(`Minimum order quantity is ${minOrderQuantity} ${baseUnit}`);
  }
  if (maxOrderQuantity && testQuantity > maxOrderQuantity) {
    errors.push(`Maximum order quantity is ${maxOrderQuantity} ${baseUnit}`);
  }
  if (!divisible && testQuantity % 1 !== 0) {
    errors.push(`Quantity rounded up to ${finalQuantity} ${unit} (non-divisible product)`);
  }

  // Calculate prices (already in rupees)
  const totalPriceInRupees = pricePerUnit * finalQuantity;
  const unitPriceInRupees = pricePerUnit;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Price Calculator Preview</h4>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Test Quantity</label>
          <Input
            type="number"
            value={testQuantity}
            onChange={(e) => setTestQuantity(Number.parseFloat(e.target.value) || 0)}
            min={0}
            step={divisible ? 0.001 : 1}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Unit Price</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatAmountWithSymbol(unitPriceInRupees * 100)} / {unit}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Total Price</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatAmountWithSymbol(totalPriceInRupees * 100)}
            </p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="text-xs text-red-600 space-y-1">
            {errors.map((error, index) => (
              <p key={index}>⚠ {error}</p>
            ))}
          </div>
        )}

        {finalQuantity !== testQuantity && (
          <p className="text-xs text-amber-600">
            Quantity adjusted: {testQuantity} → {finalQuantity} {unit}
          </p>
        )}
      </div>
    </div>
  );
}

