export const getWhatsAppUrl = (brand, phone, text = "") => {
  // brand.whatsappMode === 'web' -> use web url format if present
  const cleanedPhone = phone.replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  if (brand && brand.whatsappMode === "web" && brand.whatsappWebUrl) {
    // construct web URL + message if brand has special web URL
    return `${brand.whatsappWebUrl}?phone=${cleanedPhone}&text=${encoded}`;
  }
  // default WhatsApp url
  return `https://wa.me/${cleanedPhone}?text=${encoded}`;
};
