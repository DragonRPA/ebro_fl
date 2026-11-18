import {
  RENTAL_ONLY_PAYABLE_TYPES,
  type FlApPayable,
  type FlContract,
  type FlFulfillment,
  type FlLogisticsDispatch,
  type FlPurchase,
} from '../../types/domain';

export function buildNonRentalPayables(datasets: {
  apPayables: FlApPayable[];
  purchases: FlPurchase[];
  contracts: FlContract[];
  fulfillments: FlFulfillment[];
  logisticsDispatches: FlLogisticsDispatch[];
}): FlApPayable[] {
  const rentalPurchaseIds = new Set(
    datasets.purchases.filter((p) => p.targetDomain === 'RENTAL').map((p) => p.id)
  );
  const rentalContractIds = new Set(
    datasets.contracts.filter((c) => c.contractDomain === 'RENTAL').map((c) => c.id)
  );
  const rentalFulfillmentIds = new Set(
    datasets.fulfillments.filter((f) => f.fulfillmentDomain === 'RENTAL').map((f) => f.id)
  );
  const rentalDispatchIds = new Set(
    datasets.logisticsDispatches
      .filter(
        (d) =>
          d.dispatchPurpose === '교환' ||
          (d.relatedRefId
            ? rentalContractIds.has(d.relatedRefId) || rentalFulfillmentIds.has(d.relatedRefId)
            : false)
      )
      .map((d) => d.id)
  );
  const rentalPayableSet = new Set<FlApPayable['payableType']>(RENTAL_ONLY_PAYABLE_TYPES);
  return datasets.apPayables.filter((ap) => {
    if (rentalPayableSet.has(ap.payableType)) return false;
    if (ap.payableType === 'PURCHASE' && ap.refId && rentalPurchaseIds.has(ap.refId)) return false;
    if (ap.payableType === 'LOGISTICS' && ap.refId && rentalDispatchIds.has(ap.refId)) return false;
    return true;
  });
}
