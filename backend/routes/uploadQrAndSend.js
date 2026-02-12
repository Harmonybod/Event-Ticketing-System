app.post("/uploadQrAndSend", async (req, res) => {
    try {
      const { phoneNumber, fileName } = req.body;
  
      if (!phoneNumber || !fileName) {
        return res.status(400).json({ error: "Missing phoneNumber or fileName" });
      }
  
      const filePath = path.join(__dirname, "public_qr", fileName);
  
      // 1) Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(filePath, {
        folder: "event_qrs"
      });
  
      const imageUrl = uploadResult.secure_url;
  
      // 2) Send via WhatsApp Cloud API
      const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
      const payload = {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "image",
        image: {
          link: imageUrl
        }
      };
  
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      });
  
      res.json({
        success: true,
        cloudinaryUrl: imageUrl,
        whatsapp: response.data
      });
  
    } catch (err) {
      console.error("Error:", err);
      res.status(500).json({ error: "Upload or WhatsApp send failed" });
    }
  });
  