const profileRepository = require("./profileRepository");

async function getProfile(userId) {
  try {
    if (!userId) return null;

    const profile = await profileRepository.getUserProfileData(userId);
    return profile;
  } catch (error) {
    console.error("[Profile Service] Fehler beim Laden des Profils:", error);
    throw error;
  }
}

async function updateProfile(userId, displayName, bio, avatarUrl) {
  try {
    if (!userId) return null;

    const cleanName = displayName.substring(0, 32);
    const cleanBio = bio ? bio.substring(0, 255) : "";
    const cleanAvatarUrl = avatarUrl ? avatarUrl.substring(0, 255) : "";

    function isValidAvatarUrl(url) {
      if (!url) return true;
      return /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url);
    }

    if (cleanAvatarUrl && !isValidAvatarUrl(cleanAvatarUrl)) {
      throw new Error("Ungültige Avatar-URL");
    }

    const updatedData = await profileRepository.updateUserProfile(
      userId,
      cleanName,
      cleanBio,
      cleanAvatarUrl,
    );
    return updatedData;
  } catch (error) {
    console.error(
      "[Profile Service] Fehler beim Aktualisieren des Profils:",
      error,
    );
    throw error;
  }
}

async function getLeaderboard() {
  try {
    const leaderboard = await profileRepository.getLeaderboard();
    return leaderboard;
  } catch (error) {
    console.error(
      "[Profile Service] Fehler beim Laden der Bestenliste:",
      error,
    );
    throw error;
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getLeaderboard,
};
