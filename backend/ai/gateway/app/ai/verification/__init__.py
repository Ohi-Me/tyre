"""
Verification services — Y1 wedge.

Two critical verifications:
  1. Truck photos + condition verification (solves fake truck problem)
  2. Consignee WhatsApp confirmation (solves 'never received' dispute, 5-10% of loads)

Both are required for UPI escrow trust.
"""
from .consignee_confirm import ConsigneeConfirmationService
from .truck_photos import TruckPhotoVerifier

__all__ = ["TruckPhotoVerifier", "ConsigneeConfirmationService"]
