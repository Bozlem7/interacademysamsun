export interface StudentNotifyFields {
  motherName?: string | null;
  motherPhone?: string | null;
  fatherName?: string | null;
  fatherPhone?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  notifyMother?: boolean;
  notifyFather?: boolean;
  notifyGuardian?: boolean;
}

// Backend'deki services/notifyRecipients.js ile birebir aynı öncelik/mantık: sadece
// WhatsApp bildirimi için işaretlenmiş VE telefonu dolu olan kişiler sayılır. Anne/baba/
// yakın hepsi işaretliyse hepsine gidilir — bu yüzden burada "tek numara" değil, "en az
// bir alıcı var mı" (buton görünürlüğü için) kontrol ediyoruz.
export function hasWhatsAppNotifyRecipient(student: StudentNotifyFields): boolean {
  return (
    (!!student.notifyMother && !!student.motherPhone) ||
    (!!student.notifyFather && !!student.fatherPhone) ||
    (!!student.notifyGuardian && !!student.emergencyPhone)
  );
}

/** WhatsApp bildirimi gidecek kişi(ler)in adını döner — "Anne", "Baba" veya "Vasi/Yakın" etiketiyle. */
export function getWhatsAppNotifyRecipientNames(student: StudentNotifyFields): string[] {
  const names: string[] = [];
  if (student.notifyMother && student.motherPhone && student.motherName) names.push(student.motherName);
  if (student.notifyFather && student.fatherPhone && student.fatherName) names.push(student.fatherName);
  if (student.notifyGuardian && student.emergencyPhone && student.emergencyName) names.push(student.emergencyName);
  return names;
}

export interface WhatsAppNotifyPrimaryRecipient {
  role: "Anne" | "Baba" | "Yakını";
  name: string;
}

// Kompakt/tek satır gösterimler için (ör. ödeme listesi kartı): birden fazla kişi işaretliyse
// hepsini alt alta sıkıştırmak yerine tek bir öncelikli kişi gösterilir. Öncelik: Baba > Anne > Yakın.
export function getWhatsAppNotifyPrimaryRecipient(student: StudentNotifyFields): WhatsAppNotifyPrimaryRecipient | null {
  if (student.notifyFather && student.fatherPhone && student.fatherName) {
    return { role: "Baba", name: student.fatherName };
  }
  if (student.notifyMother && student.motherPhone && student.motherName) {
    return { role: "Anne", name: student.motherName };
  }
  if (student.notifyGuardian && student.emergencyPhone && student.emergencyName) {
    return { role: "Yakını", name: student.emergencyName };
  }
  return null;
}
