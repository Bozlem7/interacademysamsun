// Öğrencinin "WhatsApp Bildirimi Gönder" olarak işaretlenmiş kişilerinin telefon
// numaralarını döner. Sadece notify_* bayrağı true VE ilgili telefon alanı doluysa
// listeye girer (checkbox işaretli ama telefon boş bırakılan bir kayıt asla oluşmaz,
// çünkü form/validasyon bunu zaten engelliyor — burada yine de savunmaya karşı kontrol
// ediyoruz). Birden fazla kişi işaretliyse hepsine bildirim gider.
function getNotifyRecipients(student) {
  const recipients = [];
  if (student.notifyMother && student.motherPhone) {
    recipients.push({ label: "Anne", phone: student.motherPhone });
  }
  if (student.notifyFather && student.fatherPhone) {
    recipients.push({ label: "Baba", phone: student.fatherPhone });
  }
  if (student.notifyGuardian && student.emergencyPhone) {
    recipients.push({ label: "Vasi/Yakın", phone: student.emergencyPhone });
  }
  return recipients;
}

module.exports = { getNotifyRecipients };
