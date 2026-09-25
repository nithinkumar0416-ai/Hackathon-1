// Direct-access middleware — injects the owner user_id from env into every request.
// No JWT required. Single-user mode.
const directAccess = (req, res, next) => {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) {
    return res.status(500).json({
      error: 'OWNER_USER_ID not set in server/.env — add the UUID of your Supabase user.',
    });
  }
  req.user = { user_id: ownerId };
  next();
};

export default directAccess;
