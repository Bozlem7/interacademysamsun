export interface StudentNotifyFields {
  motherPhone?: string | null;
  fatherPhone?: string | null;
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
