import Purchases, { type PurchasesPackage } from 'react-native-purchases';

export async function getCurrentOffering() {
  return (await Purchases.getOfferings()).current;
}

export async function purchasePackage(pack: PurchasesPackage) {
  return Purchases.purchasePackage(pack);
}

export async function restorePurchases() {
  return Purchases.restorePurchases();
}
