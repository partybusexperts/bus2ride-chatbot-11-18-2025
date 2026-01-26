import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_MAIL_USER,
    pass: process.env.ZOHO_MAIL_PASSWORD,
  },
});

type QuotedVehicle = {
  name: string;
  capacity: number;
  price: number;
  hours: number;
  image?: string;
};

type QuoteRequest = {
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  tripDate?: string;
  tripTime?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  eventType?: string;
  passengers?: number;
  vehicles: QuotedVehicle[];
  agentName?: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function generateEmailHtml(data: QuoteRequest): string {
  const totalPrice = data.vehicles.reduce((sum, v) => sum + v.price, 0);
  const deposit = Math.round(totalPrice * 0.5);
  const firstName = data.customerName?.split(' ')[0] || 'there';
  const agentFirstName = data.agentName?.split(' ')[0] || 'Your Agent';

  const vehicleBlocks = data.vehicles.map(v => `
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 25px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ffd700;">
      <h3 style="color: #ffd700; margin: 0 0 15px 0; font-size: 20px;">🚗 Your Ride: ${v.name}</h3>
      <div style="color: #e0e0e0; line-height: 1.8; font-size: 15px;">
        <p style="margin: 8px 0;">✨ Luxury wrap-around leather seating for a VIP feel</p>
        <p style="margin: 8px 0;">🎶 Surround sound system (Bluetooth/AUX for your playlist)</p>
        <p style="margin: 8px 0;">💡 LED/Laser light show to set the mood</p>
        <p style="margin: 8px 0;">🍸 Wet bar stocked with ice & bottled water</p>
        <p style="margin: 8px 0;">🛑 Unlimited stops—we go where the party goes!</p>
      </div>
      <div style="background: #ffd700; color: #1a1a2e; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: center;">
        <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 600;">💰 ${v.hours}-HOUR QUOTE</p>
        <p style="margin: 0; font-size: 24px; font-weight: bold;">🤑 ${formatCurrency(v.price)}</p>
        <p style="margin: 5px 0 0 0; font-size: 12px;">(includes tax & fuel—no surprises! ✨)</p>
      </div>
    </div>
  `).join('');

  const minHours = Math.min(...data.vehicles.map(v => v.hours));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f0f0f0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <div style="background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      
      <p style="font-size: 18px; color: #333; margin: 0 0 20px 0;">Hi ${firstName},</p>
      
      <p style="color: #333; line-height: 1.7; font-size: 15px;">
        Thanks for reaching out! 🎉
        ${data.tripDate ? `<br><br>🚨 <strong>Availability for ${data.tripDate} is limited.</strong> It's a popular date so I wanted to send you the details right away!` : ''}
      </p>
      
      ${vehicleBlocks}
      
      <p style="color: #666; font-size: 14px; margin: 20px 0;">
        ⏳ Our rental minimum starts at ${minHours} hours
      </p>
      
      ${data.vehicles.length > 1 ? `
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; font-weight: 600; color: #333;">📊 Total for all vehicles: <span style="color: #28a745; font-size: 18px;">${formatCurrency(totalPrice)}</span></p>
      </div>
      ` : ''}
      
      <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0;">
        <p style="color: #fff; margin: 0 0 5px 0; font-size: 16px; font-weight: 600;">🔒 Lock In Your Date</p>
        <p style="color: #fff; margin: 0 0 15px 0; font-size: 14px;">50% deposit: <strong>${formatCurrency(deposit)}</strong></p>
        <a href="tel:7204145465" style="display: inline-block; background: #fff; color: #28a745; padding: 14px 35px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 16px;">📞 Call 720-414-5465</a>
      </div>
      
      <p style="color: #333; line-height: 1.7; font-size: 15px;">
        We're filling up fast for your date, so let me know ASAP if you'd like to lock this in! 💸
      </p>
      
      <p style="color: #333; line-height: 1.7; font-size: 15px;">
        If you have any questions or need to adjust the details, I'm here to help! Let's make sure your event goes off without a hitch! 🎉
      </p>
      
      <p style="color: #333; margin-top: 30px; font-size: 15px;">
        Thanks,<br><br>
        <strong style="font-size: 16px;">${agentFirstName}</strong><br>
        <span style="color: #666;">Limo Bus Reservations</span>
      </p>
      
    </div>
    
    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
      <p style="margin: 0;">Limo Bus Reservations | 720-414-5465</p>
      <p style="margin: 5px 0 0 0;">info@limobusreservations.com</p>
    </div>
    
  </div>
</body>
</html>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const data: QuoteRequest = await request.json();

    if (!data.customerEmail) {
      return NextResponse.json({ error: 'Customer email is required' }, { status: 400 });
    }

    if (!data.vehicles || data.vehicles.length === 0) {
      return NextResponse.json({ error: 'At least one vehicle is required' }, { status: 400 });
    }

    const totalPrice = data.vehicles.reduce((sum, v) => sum + v.price, 0);

    const mailOptions = {
      from: `"Limo Bus Reservations" <${process.env.ZOHO_MAIL_USER}>`,
      to: data.customerEmail,
      subject: `Your Vehicle Quote - ${formatCurrency(totalPrice)}`,
      html: generateEmailHtml(data),
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ 
      success: true, 
      message: `Quote sent to ${data.customerEmail}` 
    });

  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: 'Failed to send email', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
