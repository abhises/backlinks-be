const prisma = require('../lib/prisma');
const wsManager = require('../lib/ws');

const submitFeedback = async (req, res) => {
  const { topic, message, rating, recommend } = req.body;
  
  if (!topic || !message) {
    return res.status(400).json({ error: 'Topic and message are required' });
  }

  try {
    const feedback = await prisma.feedback.create({
      data: { 
        userId: req.user.userId, 
        topic, 
        message: message.trim(), 
        rating: Number(rating) || 0, 
        recommend 
      },
    });

    wsManager.notifyAdminsFeedback({ feedbackId: feedback.id, topic: feedback.topic, createdAt: feedback.createdAt });

    res.json({ feedback });
  } catch (err) {
    console.error('Error in submitFeedback:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getFeedbackHistory = async (req, res) => {
  try {
    const history = await prisma.feedback.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(history);
  } catch (err) {
    console.error('Error in getFeedbackHistory:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { submitFeedback, getFeedbackHistory };
